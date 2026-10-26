import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dlm from "aws-cdk-lib/aws-dlm";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import type { Construct } from "constructs";

export interface FloraProdStackProps extends StackProps {
  /** `owner/repo` allowed to assume the deploy role through GitHub OIDC. */
  githubRepo: string;
  /** The GitHub environment the deploy job runs in — part of the OIDC `sub`. */
  githubEnvironment: string;
  /** Pinned docker compose plugin release installed by user data. */
  composeVersion: string;
  /**
   * Daily start/stop window for the instance, to save on compute
   * (TASK-aws-deploy §2.11). Stopped, only the disk, the Elastic IP and
   * storage bill (~$7/mo). `enabled: false` keeps the schedules defined but
   * paused — start/stop by hand with `pnpm infra:aws:start` / `:stop`.
   */
  schedule: { enabled: boolean; timezone: string; startHour: number; stopHour: number };
}

const APPS = ["web", "api", "worker"] as const;
const BACKUP_TAG = { key: "flora-backup", value: "daily" };

/**
 * Flora production on one EC2 instance running docker compose
 * (TASK-aws-deploy §2.1/§2.3): CloudFront for TLS and the raster bucket,
 * ECR for images built in CI, SSM for access and deploys, GitHub OIDC for
 * the deploy role. Secrets are never in this stack — they live in
 * Parameter Store under /flora/prod/, set by hand (infra/README.md).
 */
export class FloraProdStack extends Stack {
  constructor(scope: Construct, id: string, props: FloraProdStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { isDefault: true });

    // --- Storage -----------------------------------------------------------

    // Private (Block Public Access on); served only through CloudFront's OAC
    // at /rasters/* — the stored key already starts with `rasters/`
    // (packages/raster's rasterObjectKey), so invariant 2's permanent URL is
    // `${R2_PUBLIC_BASE_URL}/${key}` with no key change.
    const rasters = new s3.Bucket(this, "Rasters", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Compose file + deploy.sh for each deployed sha, uploaded by the deploy
    // workflow and fetched by the instance — so a change to either ships with
    // the commit that made it instead of drifting on the box.
    const deployArtifacts = new s3.Bucket(this, "DeployArtifacts", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(30) }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const repositories = APPS.map(
      (app) =>
        new ecr.Repository(this, `Repo-${app}`, {
          repositoryName: `flora/${app}`,
          imageScanOnPush: true,
          lifecycleRules: [{ maxImageCount: 10 }],
          removalPolicy: RemovalPolicy.DESTROY,
          emptyOnDelete: true,
        }),
    );
    const registry = `${this.account}.dkr.ecr.${this.region}.amazonaws.com`;

    // --- Instance ----------------------------------------------------------

    const instanceRole = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")],
    });
    for (const repo of repositories) {
      repo.grantPull(instanceRole);
    }
    deployArtifacts.grantRead(instanceRole);
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParametersByPath"],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/flora/prod`],
      }),
    );
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameters", "ssm:GetParameter"],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/flora/prod/*`],
      }),
    );

    // Only CloudFront reaches the instance — no SSH, no direct HTTP.
    const securityGroup = new ec2.SecurityGroup(this, "InstanceSg", {
      vpc,
      description: "Flora web: CloudFront origin-facing only",
      allowAllOutbound: true,
    });
    const cloudfrontOriginFacing = ec2.PrefixList.fromLookup(this, "CloudFrontOriginFacing", {
      prefixListName: "com.amazonaws.global.cloudfront.origin-facing",
    });
    securityGroup.addIngressRule(
      ec2.Peer.prefixList(cloudfrontOriginFacing.prefixListId),
      ec2.Port.tcp(3000),
      "CloudFront to apps/web",
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -euxo pipefail",
      // 2 GiB of swap: headroom for the 2 GiB instance during image pulls and
      // migrations, not a substitute for the per-service caps.
      "fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile",
      "echo '/swapfile none swap defaults 0 0' >> /etc/fstab",
      "dnf install -y docker",
      "systemctl enable --now docker",
      "mkdir -p /usr/local/lib/docker/cli-plugins",
      `curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose https://github.com/docker/compose/releases/download/${props.composeVersion}/docker-compose-linux-x86_64`,
      "chmod +x /usr/local/lib/docker/cli-plugins/docker-compose",
      "mkdir -p /opt/flora",
      `echo '${this.region}' > /opt/flora/REGION`,
      `echo '${registry}' > /opt/flora/REGISTRY`,
      `echo '${deployArtifacts.bucketName}' > /opt/flora/ARTIFACT_BUCKET`,
    );

    const instance = new ec2.Instance(this, "Instance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // amd64, not Graviton: the official postgis image CI tests against has
      // no arm64 build, and standard GitHub runners build amd64 natively
      // (TASK-aws-deploy §2.2). t3.small, not the planned t3.medium: the
      // account is on AWS's Free plan, which only launches Free Tier
      // eligible types — 2 GiB, so user data adds swap and the compose file
      // caps Postgres, Redis and each Node heap (TASK-aws-deploy §2.1).
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      role: instanceRole,
      securityGroup,
      userData,
      requireImdsv2: true,
      propagateTagsToVolumeOnCreation: true,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(30, { volumeType: ec2.EbsDeviceVolumeType.GP3, encrypted: true }),
        },
      ],
    });
    Tags.of(instance).add(BACKUP_TAG.key, BACKUP_TAG.value);

    // A stable address across stop/start, and a stable DNS name for
    // CloudFront's origin (an origin must be a hostname, not an IP).
    const eip = new ec2.CfnEIP(this, "Eip", { domain: "vpc", instanceId: instance.instanceId });
    const originHost = Fn.join("", [
      "ec2-",
      Fn.join("-", Fn.split(".", eip.attrPublicIp)),
      this.region === "us-east-1" ? ".compute-1.amazonaws.com" : `.${this.region}.compute.amazonaws.com`,
    ]);

    // Postgres's data lives on the root volume (a docker named volume).
    // Daily snapshot, keep 7 (TASK-aws-deploy §2.1).
    const dlmRole = new iam.Role(this, "DlmRole", {
      assumedBy: new iam.ServicePrincipal("dlm.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSDataLifecycleManagerServiceRole"),
      ],
    });
    new dlm.CfnLifecyclePolicy(this, "DailySnapshots", {
      description: "Flora prod daily EBS snapshots",
      state: "ENABLED",
      executionRoleArn: dlmRole.roleArn,
      policyDetails: {
        resourceTypes: ["VOLUME"],
        targetTags: [{ key: BACKUP_TAG.key, value: BACKUP_TAG.value }],
        schedules: [
          {
            name: "daily",
            createRule: { interval: 24, intervalUnit: "HOURS", times: ["05:00"] },
            retainRule: { count: 7 },
            copyTags: true,
          },
        ],
      },
    });

    // --- Start/stop schedule ----------------------------------------------

    // EventBridge Scheduler's universal target calls EC2 directly — no Lambda.
    // Docker's `restart: unless-stopped` brings the stack back on start.
    const schedulerRole = new iam.Role(this, "SchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });
    schedulerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:StartInstances", "ec2:StopInstances"],
        resources: [`arn:aws:ec2:${this.region}:${this.account}:instance/${instance.instanceId}`],
      }),
    );
    for (const [name, action, hour] of [
      ["Start", "startInstances", props.schedule.startHour],
      ["Stop", "stopInstances", props.schedule.stopHour],
    ] as const) {
      new scheduler.CfnSchedule(this, `${name}Schedule`, {
        description: `${name} the Flora instance daily (TASK-aws-deploy §2.11)`,
        state: props.schedule.enabled ? "ENABLED" : "DISABLED",
        scheduleExpression: `cron(0 ${hour} * * ? *)`,
        scheduleExpressionTimezone: props.schedule.timezone,
        flexibleTimeWindow: { mode: "OFF" },
        target: {
          arn: `arn:aws:scheduler:::aws-sdk:ec2:${action}`,
          roleArn: schedulerRole.roleArn,
          input: JSON.stringify({ InstanceIds: [instance.instanceId] }),
        },
      });
    }

    // --- CloudFront --------------------------------------------------------

    const webOrigin = new origins.HttpOrigin(originHost, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 3000,
    });
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Flora prod",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: webOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        // Everything app-shaped is per-user: cookies, the Origin header
        // originCheckMiddleware compares to WEB_ORIGIN, query strings.
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      additionalBehaviors: {
        "/_next/static/*": {
          origin: webOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        "/rasters/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(rasters),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
    });

    // --- Raster writer -----------------------------------------------------

    // Static keys, not the instance role: packages/config's env schema
    // requires S3_ACCESS_KEY_ID/SECRET and raster-store passes them
    // explicitly (TASK-aws-deploy §2.2). The access key itself is created
    // by CLI and stored as a SecureString, never in this template.
    const rasterWriter = new iam.User(this, "RasterWriter");
    rasters.grantPut(rasterWriter, "rasters/*");

    // --- GitHub deploy role ------------------------------------------------

    // The account already has GitHub's OIDC provider; import, don't recreate.
    const github = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHubOidc",
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );
    const deployRole = new iam.Role(this, "GitHubDeployRole", {
      assumedBy: new iam.WebIdentityPrincipal(github.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${props.githubRepo}:environment:${props.githubEnvironment}`,
        },
      }),
      maxSessionDuration: Duration.hours(1),
    });
    for (const repo of repositories) {
      repo.grantPullPush(deployRole);
    }
    deployArtifacts.grantPut(deployRole);
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:SendCommand"],
        resources: [
          `arn:aws:ec2:${this.region}:${this.account}:instance/${instance.instanceId}`,
          `arn:aws:ssm:${this.region}::document/AWS-RunShellScript`,
        ],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"],
        resources: ["*"],
      }),
    );

    // --- Outputs (copied into the GitHub `production` environment) ---------

    new CfnOutput(this, "WebOrigin", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new CfnOutput(this, "InstanceId", { value: instance.instanceId });
    new CfnOutput(this, "Registry", { value: registry });
    new CfnOutput(this, "DeployRoleArn", { value: deployRole.roleArn });
    new CfnOutput(this, "DeployArtifactBucket", { value: deployArtifacts.bucketName });
    new CfnOutput(this, "RasterBucket", { value: rasters.bucketName });
    new CfnOutput(this, "RasterWriterUser", { value: rasterWriter.userName });
  }
}

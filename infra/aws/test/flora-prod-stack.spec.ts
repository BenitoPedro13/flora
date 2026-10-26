import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { FloraProdStack } from "../lib/flora-prod-stack.js";

// Lookups resolve to CDK's dummy values with no cdk.context.json in scope —
// enough to assert the template's security shape (TASK-aws-deploy §6).
const app = new App();
const stack = new FloraProdStack(app, "Test", {
  env: { account: "123456789012", region: "us-east-1" },
  githubRepo: "BenitoPedro13/flora",
  githubEnvironment: "production",
  composeVersion: "v5.6.1",
  schedule: { enabled: false, timezone: "America/Sao_Paulo", startHour: 8, stopHour: 0 },
});
const template = Template.fromStack(stack);

describe("FloraProdStack", () => {
  it("keeps every bucket fully private", () => {
    const buckets = template.findResources("AWS::S3::Bucket");
    expect(Object.keys(buckets)).toHaveLength(2);
    for (const bucket of Object.values(buckets)) {
      expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      });
    }
  });

  it("admits only CloudFront's origin-facing prefix list, only on 3000", () => {
    // Inline rules and standalone ingress resources (CDK emits the latter
    // when the peer is a token, as a looked-up prefix list is).
    const groups = template.findResources("AWS::EC2::SecurityGroup");
    const standalone = template.findResources("AWS::EC2::SecurityGroupIngress");
    const ingress = [
      ...Object.values(groups).flatMap((g) => g.Properties.SecurityGroupIngress ?? []),
      ...Object.values(standalone).map((r) => r.Properties),
    ];
    expect(ingress).toHaveLength(1);
    expect(ingress[0]).toMatchObject({ FromPort: 3000, ToPort: 3000, IpProtocol: "tcp" });
    expect(ingress[0].SourcePrefixListId).toBeDefined();
    expect(ingress[0].CidrIp).toBeUndefined();
  });

  it("scopes the GitHub deploy role to this repo's production environment", () => {
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub": "repo:BenitoPedro13/flora:environment:production",
              },
            },
          }),
        ]),
      },
    });
  });

  it("requires IMDSv2 and encrypts the root volume", () => {
    template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
      LaunchTemplateData: { MetadataOptions: { HttpTokens: "required" } },
    });
    template.hasResourceProperties("AWS::EC2::Instance", {
      BlockDeviceMappings: [Match.objectLike({ Ebs: Match.objectLike({ Encrypted: true, VolumeType: "gp3" }) })],
    });
  });

  it("defines the start/stop schedule but leaves it paused when disabled", () => {
    const schedules = Object.values(template.findResources("AWS::Scheduler::Schedule"));
    expect(schedules).toHaveLength(2);
    for (const s of schedules) {
      expect(s.Properties.State).toBe("DISABLED");
    }
  });

  it("never caches the app, and routes /rasters/* to S3 through OAC", () => {
    template.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          // Managed-CachingDisabled
          CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
          ViewerProtocolPolicy: "redirect-to-https",
        }),
        CacheBehaviors: Match.arrayWith([Match.objectLike({ PathPattern: "/rasters/*" })]),
      }),
    });
  });
});

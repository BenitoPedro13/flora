import { App } from "aws-cdk-lib";
import { FloraProdStack } from "../lib/flora-prod-stack.js";

const app = new App();

// Committed in cdk.json, not passed with -c, so a later plain `cdk deploy`
// can't silently flip it. Edit "flora:schedule" and deploy to turn it on.
const schedule = app.node.tryGetContext("flora:schedule") as {
  enabled: boolean;
  timezone: string;
  startHour: number;
  stopHour: number;
};

new FloraProdStack(app, "FloraProd", {
  // Explicit env: Vpc.fromLookup and PrefixList.fromLookup need a concrete
  // account/region at synth time (results cached in cdk.context.json).
  env: { account: "860897618882", region: "us-east-1" },
  githubRepo: "BenitoPedro13/flora",
  githubEnvironment: "production",
  composeVersion: "v5.6.1",
  schedule,
});

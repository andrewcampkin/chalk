#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { SyncStack } from "../lib/sync-stack";

const app = new App();

new SyncStack(app, "ChalkSync", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // Pinned rather than taken from the caller's shell: the bucket holding the
    // log lives in exactly one region, and a deploy from a differently
    // configured machine must not quietly stand up a second empty one.
    region: "ap-southeast-2",
  },
});

# infra

The AWS resources for Chalk's cloud backup: an S3 bucket, a Cognito user pool,
and one Lambda behind an HTTP API that rejects anything without a valid token
before the function runs. The app does not currently call it.

No part of this ships in the app. Metro, EAS, vitest and the app's tsconfig all
exclude it.

Deployed only by **Actions ▸ Infrastructure ▸ Run workflow**, which is manual
and defaults to `diff`. Nothing deploys on push or merge.

Run `diff` and read it before every `deploy`. That is the approval step: CDK
cannot prompt on a headless runner, so `deploy` passes `--require-approval
never`. A diff proposing to **replace or destroy** the bucket or the user pool
is a stop sign. Both are `RETAIN`, so CloudFormation will orphan rather than
delete them, but a replacement still points the app at empty storage.

The region is pinned to `ap-southeast-2` in `bin/chalk.ts` and in the workflow.
Change both to deploy elsewhere.

## One-time setup

Run by a human with real credentials. The workflow cannot do any of it: the
role it assumes is the thing being created here.

**Bootstrap CDK** for the account and region:

```bash
npm ci
npx cdk bootstrap aws://ACCOUNT_ID/ap-southeast-2
```

This creates the `cdk-hnb659fds-*` roles the deploy role is allowed to assume.
By default the CloudFormation execution role it creates carries
`AdministratorAccess`. That, not the GitHub role, is the ceiling on what a
deploy can do; `--cloudformation-execution-policies` narrows it.

**Let GitHub assume a deploy role.** Create the OIDC provider once
(`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`), then a
role trusting only your fork of this repository:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:*" }
    }
  }]
}
```

Give it permission to assume the CDK roles and nothing else, so a compromised
workflow cannot reach the rest of the account:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::ACCOUNT_ID:role/cdk-*"
  }]
}
```

Put the role ARN in the repository variable `AWS_DEPLOY_ROLE_ARN`. It is a
variable, not a secret: an ARN names a role, it does not grant anything.

**Merge the workflow to `main`.** GitHub only offers *Run workflow* for a
`workflow_dispatch` file that exists on the default branch. There is no push or
pull_request trigger, so merging deploys nothing.

## Adding a user

Nobody can sign themselves up. Create each user deliberately:

```bash
aws cognito-idp admin-create-user \
  --region ap-southeast-2 \
  --user-pool-id USER_POOL_ID \
  --username you@example.com \
  --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
```

If sign-in then reports the account needs a password change, clear the state
once. The app never uses a password, but Cognito can leave a newly created user
waiting for one:

```bash
aws cognito-idp admin-set-user-password \
  --region ap-southeast-2 --user-pool-id USER_POOL_ID \
  --username you@example.com --password "$(openssl rand -base64 24)" --permanent
```

## After a deploy

The stack prints `Region`, `UserPoolId`, `UserPoolClientId` and `ApiBaseUrl`,
and they can be read back at any time:

```bash
aws cloudformation describe-stacks --stack-name ChalkSync \
  --region ap-southeast-2 --query 'Stacks[0].Outputs' --output table
```

None is a secret. They name the deployment, they do not authorise anything.

Confirm the front door is shut:

```bash
curl -i https://API_ID.execute-api.ap-southeast-2.amazonaws.com/sync
# expect: HTTP/2 401
```

## Working on it locally

```bash
npm ci
npm run typecheck
npx cdk synth      # no AWS credentials needed
```

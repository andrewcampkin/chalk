import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  CfnUserPool,
  CfnUserPoolClient,
  UserPool,
  UserPoolClient,
} from "aws-cdk-lib/aws-cognito";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, Function as LambdaFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { join } from "node:path";

/**
 * Cloud backup for Chalk: one JSON document per user, in one bucket, reachable
 * only through a Lambda that is only reachable with a valid Cognito token.
 *
 * The client never holds an AWS credential and never names its own storage
 * key. The key is derived from the `sub` claim that API Gateway has already
 * validated, so asking for another user's log is not a request that can be
 * expressed.
 */
export class SyncStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /* ---- storage --------------------------------------------------------- */

    const bucket = new Bucket(this, "LogBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Every write keeps the version it replaced. Nothing the app or a stolen
      // token can do destroys history, which is the point of a backup.
      versioned: true,
      // A `cdk destroy` must never take the log with it.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    /* ---- accounts -------------------------------------------------------- */

    const userPool = new UserPool(this, "Users", {
      // Nobody signs themselves up. Users are created deliberately with the
      // CLI — see infra/README.md — so the only public surface Cognito exposes
      // is signing in as somebody who already exists.
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Email one-time code as the only way in. The L2 construct does not expose
    // the sign-in policy yet, so it is set on the underlying resource; a deploy
    // fails loudly if the region cannot do EMAIL_OTP, which is the answer we
    // want rather than a silent fallback to passwords.
    (userPool.node.defaultChild as CfnUserPool).addPropertyOverride(
      "Policies.SignInPolicy.AllowedFirstAuthFactors",
      ["EMAIL_OTP"],
    );

    const client = new UserPoolClient(this, "AppClient", {
      userPool,
      // A phone app cannot keep a secret, so it is a public client. The client
      // id is not sensitive: it names the app, it does not authorise anything.
      generateSecret: false,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(60),
      preventUserExistenceErrors: true,
    });

    // USER_AUTH is the choice-based flow that carries EMAIL_OTP. Set on the
    // underlying resource for the same reason as the sign-in policy above.
    (client.node.defaultChild as CfnUserPoolClient).addPropertyOverride(
      "ExplicitAuthFlows",
      ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    );

    /* ---- the only thing that touches the bucket --------------------------- */

    const handler = new LambdaFunction(this, "SyncHandler", {
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      // Plain ESM against the SDK the runtime already ships, so there is no
      // bundler in the deploy path and `npm ci` stays clean under the repo's
      // ignore-scripts policy.
      code: Code.fromAsset(join(__dirname, "..", "lambda", "sync")),
      environment: { BUCKET: bucket.bucketName },
      timeout: Duration.seconds(15),
      memorySize: 256,
      logGroup: new LogGroup(this, "SyncHandlerLogs", {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    // Read and write one prefix, and nothing else. Deliberately no
    // DeleteObject and no ListBucket: a fully compromised client can overwrite
    // its own log — recoverably, because the bucket is versioned — and can
    // neither destroy it nor discover that anybody else exists.
    handler.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [bucket.arnForObjects("users/*")],
      }),
    );

    /* ---- the edge -------------------------------------------------------- */

    const api = new HttpApi(this, "SyncApi", {
      // No CORS: the only caller is the app, over plain HTTPS.
      defaultAuthorizer: new HttpJwtAuthorizer(
        "CognitoJwt",
        `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
        { jwtAudience: [client.userPoolClientId] },
      ),
    });

    // Rejected here, before any compute runs, if the token is missing, expired
    // or issued by anything else.
    api.addRoutes({
      path: "/sync",
      methods: [HttpMethod.GET, HttpMethod.PUT],
      integration: new HttpLambdaIntegration("SyncIntegration", handler),
    });

    /* ---- what the app needs to be told ------------------------------------ */

    new CfnOutput(this, "Region", { value: this.region });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
    new CfnOutput(this, "ApiBaseUrl", { value: api.apiEndpoint });
  }
}

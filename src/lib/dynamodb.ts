import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const isLocal = process.env.STAGE === 'local' || process.env.AWS_SAM_LOCAL || process.env.LOCALSTACK_HOSTNAME;

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    ...(isLocal && {
        endpoint: process.env.LOCALSTACK_HOSTNAME 
            ? `http://${process.env.LOCALSTACK_HOSTNAME}:4566` 
            : 'http://localhost:4566',
        credentials: {
            accessKeyId: 'test',
            secretAccessKey: 'test'
        }
    })
});

export const dynamodb = DynamoDBDocumentClient.from(client);

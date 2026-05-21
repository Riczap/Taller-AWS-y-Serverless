import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const stage = process.env.STAGE || 'local';
const isLocal = stage === 'local';

const lambdaClient = new LambdaClient({
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

export interface LambdaInvokeResult {
    statusCode: number;
    body: any;
}

export const invokeLambda = async (functionName: string, payload: any): Promise<LambdaInvokeResult> => {
    try {
        console.log(`Invoking Lambda: ${functionName} with payload:`, JSON.stringify(payload));
        const command = new InvokeCommand({
            FunctionName: functionName,
            Payload: Buffer.from(JSON.stringify(payload))
        });
        const response = await lambdaClient.send(command);
        if (response.Payload) {
            const responsePayload = JSON.parse(Buffer.from(response.Payload).toString());
            console.log(`Lambda ${functionName} response:`, JSON.stringify(responsePayload));
            
            let body = responsePayload.body;
            if (typeof body === 'string') {
                try {
                    body = JSON.parse(body);
                } catch {
                    // keep as string
                }
            }
            return {
                statusCode: responsePayload.statusCode || 200,
                body: body !== undefined ? body : responsePayload
            };
        }
        return { statusCode: 200, body: null };
    } catch (error: any) {
        console.error(`Error invoking Lambda ${functionName}:`, error);
        throw error;
    }
};

// Products Lambda Helper (uses the standard service naming convention)
export const productsFn = (name: string): string => {
    return `taller-gateway-${stage}-${name}`;
};

// Directly invoke a product Lambda using the naming helper
export const invokeProductLambda = async (name: string, payload: any): Promise<LambdaInvokeResult> => {
    const targetFunctionName = productsFn(name);
    return await invokeLambda(targetFunctionName, payload);
};

// Notifications Lambda Helper
export const notificationsFn = (name: string): string => {
    return `taller-notifications-${stage}-${name}`;
};

// Directly invoke a notification Lambda using the naming helper
export const invokeNotificationLambda = async (name: string, payload: any): Promise<LambdaInvokeResult> => {
    const targetFunctionName = notificationsFn(name);
    return await invokeLambda(targetFunctionName, payload);
};

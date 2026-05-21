import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../lib/dynamodb';
import { ok, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("List all products event received:", event);

        const productTable = process.env.PRODUCT_TABLE || 'products-local';

        const result = await dynamodb.send(new ScanCommand({
            TableName: productTable
        }));

        return ok({
            products: result.Items || []
        });

    } catch (error: any) {
        console.error("Error in listAllProducts handler:", error);
        return internalServerError(error.message || "Internal server error listing products");
    }
};

export const handler = withCors(baseHandler);

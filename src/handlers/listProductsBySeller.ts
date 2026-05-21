import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../lib/dynamodb';
import { ok, badRequest, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("List products by seller event received:", event);

        const sellerId = event.pathParameters?.sellerId;
        if (!sellerId) {
            return badRequest("Seller ID is required in the path");
        }

        const productTable = process.env.PRODUCT_TABLE || 'products-local';

        const result = await dynamodb.send(new QueryCommand({
            TableName: productTable,
            IndexName: 'seller-index',
            KeyConditionExpression: 'sellerId = :sellerId',
            ExpressionAttributeValues: {
                ':sellerId': sellerId
            }
        }));

        return ok({
            products: result.Items || []
        });

    } catch (error: any) {
        console.error("Error in listProductsBySeller handler:", error);
        return internalServerError(error.message || "Internal server error listing products by seller");
    }
};

export const handler = withCors(baseHandler);

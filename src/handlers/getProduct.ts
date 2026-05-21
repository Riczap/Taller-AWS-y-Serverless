import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../lib/dynamodb';
import { ok, badRequest, notFound, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Get product event received:", event);

        const productId = event.pathParameters?.id;
        if (!productId) {
            return badRequest("Product ID is required in the path");
        }

        const productTable = process.env.PRODUCT_TABLE || 'products-local';

        const result = await dynamodb.send(new GetCommand({
            TableName: productTable,
            Key: { productId }
        }));

        if (!result.Item) {
            return notFound("Product not found");
        }

        return ok({
            data: result.Item
        });

    } catch (error: any) {
        console.error("Error in getProduct handler:", error);
        return internalServerError(error.message || "Internal server error retrieving product");
    }
};

export const handler = withCors(baseHandler);

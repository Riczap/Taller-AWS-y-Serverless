import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../lib/dynamodb';
import { ok, badRequest, forbidden, notFound, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Delete product event received:", event);

        const userId = event.requestContext.authorizer?.userId;
        if (!userId) {
            return forbidden("User is not authorized");
        }

        const productId = event.pathParameters?.id;
        if (!productId) {
            return badRequest("Product ID is required in the path");
        }

        const productTable = process.env.PRODUCT_TABLE || 'products-local';

        // 1. Fetch the existing product to check ownership
        const existingResult = await dynamodb.send(new GetCommand({
            TableName: productTable,
            Key: { productId }
        }));

        if (!existingResult.Item) {
            return notFound("Product not found");
        }

        const product = existingResult.Item;

        // 2. Validate ownership
        if (product.sellerId !== userId) {
            return forbidden("You are not the owner of this product");
        }

        // 3. Delete the product
        await dynamodb.send(new DeleteCommand({
            TableName: productTable,
            Key: { productId }
        }));

        return ok({
            message: "Product deleted successfully"
        });

    } catch (error: any) {
        console.error("Error in deleteProduct handler:", error);
        return internalServerError(error.message || "Internal server error deleting product");
    }
};

export const handler = withCors(baseHandler);

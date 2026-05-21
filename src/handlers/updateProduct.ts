import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../lib/dynamodb';
import { ok, badRequest, forbidden, notFound, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Update product event received:", event);

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

        // 3. Parse and validate body
        if (!event.body) {
            return badRequest("Request body is required");
        }

        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (e) {
            return badRequest("Body must be a valid JSON");
        }

        const { name, description, price, stock } = body;

        if (name === undefined && description === undefined && price === undefined && stock === undefined) {
            return badRequest("At least one field to update must be provided (name, description, price, stock)");
        }

        // Validations
        if (price !== undefined) {
            if (typeof price !== 'number' || price <= 0) {
                return badRequest("price must be a number greater than 0");
            }
        }

        if (stock !== undefined) {
            if (typeof stock !== 'number' || !Number.isInteger(stock) || stock <= 0) {
                return badRequest("stock must be an integer greater than 0");
            }
        }

        // 4. Build dynamic update expression
        const updateExpressionParts: string[] = [];
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        if (name !== undefined) {
            updateExpressionParts.push('#name = :name');
            expressionAttributeNames['#name'] = 'name';
            expressionAttributeValues[':name'] = name;
        }

        if (description !== undefined) {
            updateExpressionParts.push('#description = :description');
            expressionAttributeNames['#description'] = 'description';
            expressionAttributeValues[':description'] = description;
        }

        if (price !== undefined) {
            updateExpressionParts.push('#price = :price');
            expressionAttributeNames['#price'] = 'price';
            expressionAttributeValues[':price'] = price;
        }

        if (stock !== undefined) {
            updateExpressionParts.push('#stock = :stock');
            expressionAttributeNames['#stock'] = 'stock';
            expressionAttributeValues[':stock'] = stock;
        }

        // Always update updatedAt
        const now = new Date().toISOString();
        updateExpressionParts.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = now;

        const updateExpression = 'SET ' + updateExpressionParts.join(', ');

        const updateResult = await dynamodb.send(new UpdateCommand({
            TableName: productTable,
            Key: { productId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        }));

        return ok({
            message: "Product updated successfully",
            data: updateResult.Attributes
        });

    } catch (error: any) {
        console.error("Error in updateProduct handler:", error);
        return internalServerError(error.message || "Internal server error updating product");
    }
};

export const handler = withCors(baseHandler);

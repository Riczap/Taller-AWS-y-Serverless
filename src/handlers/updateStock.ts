import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../lib/dynamodb';
import { ok, badRequest, notFound, forbidden, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';
import { invokeNotificationLambda } from '../lib/lambdaInvoke';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Update stock event received:", event);

        const userId = event.requestContext.authorizer?.userId;
        if (!userId) {
            return forbidden("User is not authorized");
        }

        const productId = event.pathParameters?.id;
        if (!productId) {
            return badRequest("Product ID is required in the path");
        }

        if (!event.body) {
            return badRequest("Request body is required");
        }

        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (e) {
            return badRequest("Body must be a valid JSON");
        }

        const { quantity } = body;

        // Validations
        if (quantity === undefined) {
            return badRequest("quantity is required in the body");
        }

        if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
            return badRequest("quantity must be an integer greater than 0");
        }

        const productTable = process.env.PRODUCT_TABLE || 'products-local';
        const now = new Date().toISOString();

        try {
            const result = await dynamodb.send(new UpdateCommand({
                TableName: productTable,
                Key: { productId },
                UpdateExpression: "SET stock = stock - :quantity, updatedAt = :updatedAt",
                ConditionExpression: "attribute_exists(productId) AND stock >= :quantity",
                ExpressionAttributeValues: {
                    ":quantity": quantity,
                    ":updatedAt": now
                },
                ReturnValues: "ALL_NEW"
            }));

            const updatedProduct = result.Attributes;
            if (updatedProduct && updatedProduct.stock === 0) {
                try {
                    await invokeNotificationLambda("stockAlert", {
                        body: JSON.stringify({
                            productId: updatedProduct.productId,
                            productName: updatedProduct.name,
                            sellerId: updatedProduct.sellerId
                        })
                    });
                } catch (err) {
                    console.error("Failed to invoke stockAlert lambda:", err);
                }
            }

            return ok({
                message: "Stock updated successfully",
                data: updatedProduct
            });

        } catch (error: any) {
            if (error.name === 'ConditionalCheckFailedException') {
                // Check if product exists to provide a precise error message
                const checkProduct = await dynamodb.send(new GetCommand({
                    TableName: productTable,
                    Key: { productId }
                }));

                if (!checkProduct.Item) {
                    return notFound("Product not found");
                } else {
                    return badRequest(`Insufficient stock. Available stock: ${checkProduct.Item.stock}, requested decrement: ${quantity}`);
                }
            }
            throw error;
        }

    } catch (error: any) {
        console.error("Error in updateStock handler:", error);
        return internalServerError(error.message || "Internal server error updating product stock");
    }
};

export const handler = withCors(baseHandler);

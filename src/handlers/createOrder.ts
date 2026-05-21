import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { dynamodb } from '../lib/dynamodb';
import { invokeProductLambda } from '../lib/lambdaInvoke';
import { ok, badRequest, internalServerError, created } from '../lib/response';
import { Order, OrderItem } from '../types/order';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const userId = event.requestContext.authorizer?.userId;
        if (!userId) {
            return badRequest("User ID is missing from authorization context");
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

        const { items } = body;
        if (!Array.isArray(items) || items.length === 0) {
            return badRequest("items must be a non-empty array");
        }

        const resolvedItems: OrderItem[] = [];
        let total = 0;

        // 1. Validate items and check stock
        for (const item of items) {
            const { productId, quantity } = item;
            if (!productId) {
                return badRequest("productId is required for each item");
            }
            if (quantity === undefined || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
                return badRequest("quantity must be an integer greater than 0");
            }

            // Fetch product via Lambda invocation
            let productResult;
            try {
                productResult = await invokeProductLambda("getProduct", {
                    pathParameters: { id: productId }
                });
            } catch (err: any) {
                return internalServerError(`Error fetching product ${productId}: ${err.message}`);
            }

            if (productResult.statusCode !== 200 || !productResult.body?.data) {
                if (productResult.statusCode === 404) {
                    return badRequest(`Product with ID ${productId} not found`);
                }
                return badRequest(`Could not retrieve product with ID ${productId}`);
            }

            const product = productResult.body.data;
            if (product.stock < quantity) {
                return badRequest(`Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${quantity}`);
            }

            resolvedItems.push({
                productId,
                quantity,
                price: product.price
            });

            total += product.price * quantity;
        }

        // 2. Create order in pending status
        const ordersTable = process.env.ORDERS_TABLE;
        if (!ordersTable) {
            return internalServerError("ORDERS_TABLE environment variable not configured");
        }

        const orderId = uuidv4();
        const now = new Date().toISOString();
        const newOrder: Order = {
            orderId,
            userId,
            items: resolvedItems,
            total,
            status: 'pending',
            createdAt: now,
            updatedAt: now
        };

        await dynamodb.send(new PutCommand({
            TableName: ordersTable,
            Item: newOrder
        }));

        // 3. Decrement stock for each product
        for (const item of resolvedItems) {
            let updateStockResult;
            try {
                updateStockResult = await invokeProductLambda("updateStock", {
                    pathParameters: { id: item.productId },
                    body: JSON.stringify({ quantity: item.quantity }),
                    requestContext: {
                        authorizer: {
                            userId
                        }
                    }
                });
            } catch (err: any) {
                // Decrement failed, mark order as cancelled
                await cancelOrderInternal(ordersTable, orderId);
                return internalServerError(`Stock update failed for product ${item.productId}. Order cancelled.`);
            }

            if (updateStockResult.statusCode !== 200) {
                await cancelOrderInternal(ordersTable, orderId);
                const errorMsg = updateStockResult.body?.message || "Stock update failed";
                return internalServerError(`Stock update failed for product ${item.productId}: ${errorMsg}. Order cancelled.`);
            }
        }

        return created({
            message: "Order created successfully",
            data: newOrder
        });

    } catch (error: any) {
        console.error("Error creating order:", error);
        return internalServerError(error.message || "Internal server error creating order");
    }
};

export const handler = withCors(baseHandler);

const cancelOrderInternal = async (tableName: string, orderId: string) => {
    try {
        const now = new Date().toISOString();
        await dynamodb.send(new UpdateCommand({
            TableName: tableName,
            Key: { orderId },
            UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
            ExpressionAttributeNames: {
                "#status": "status"
            },
            ExpressionAttributeValues: {
                ":status": "cancelled",
                ":updatedAt": now
            }
        }));
    } catch (err) {
        console.error(`Failed to cancel order ${orderId} during rollback:`, err);
    }
};

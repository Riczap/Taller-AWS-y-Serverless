import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../lib/dynamodb';
import { ok, badRequest, notFound, forbidden, internalServerError } from '../lib/response';
import { invokeProductLambda } from '../lib/lambdaInvoke';
import { Order } from '../types/order';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Confirm order event received:", event);
        const callerId = event.requestContext.authorizer?.userId;
        if (!callerId) {
            return badRequest("User ID is missing from authorization context");
        }

        const orderId = event.pathParameters?.id;
        if (!orderId) {
            return badRequest("Order ID is required in the path");
        }

        const ordersTable = process.env.ORDERS_TABLE;
        if (!ordersTable) {
            return internalServerError("ORDERS_TABLE environment variable not configured");
        }

        // 1. Fetch the order
        const result = await dynamodb.send(new GetCommand({
            TableName: ordersTable,
            Key: { orderId }
        }));

        if (!result.Item) {
            return notFound("Order not found");
        }

        const order = result.Item as Order;

        // 2. Verify order status is pending
        if (order.status !== 'pending') {
            return badRequest(`Order cannot be confirmed because its current status is '${order.status}'`);
        }

        // 3. Verify the caller is a seller who owns at least one product inside the order
        let sellerProductsResult;
        try {
            sellerProductsResult = await invokeProductLambda("listProductsBySeller", {
                pathParameters: { sellerId: callerId }
            });
        } catch (err: any) {
            console.error(`Error querying seller products for user ${callerId}:`, err);
            return forbidden("Access denied. Caller is not authorized to confirm this order.");
        }

        if (sellerProductsResult.statusCode !== 200 || !sellerProductsResult.body?.products) {
            return forbidden("Access denied. Caller has no products or cannot be verified as a seller.");
        }

        const sellerProducts = sellerProductsResult.body.products;
        const sellerProductIds = new Set(sellerProducts.map((p: any) => p.productId));
        const isSellerOfAnyItem = order.items.some(item => sellerProductIds.has(item.productId));

        if (!isSellerOfAnyItem) {
            return forbidden("Access denied. Caller does not sell any of the products in this order.");
        }

        // 4. Update the order status to confirmed
        const now = new Date().toISOString();
        
        await dynamodb.send(new UpdateCommand({
            TableName: ordersTable,
            Key: { orderId },
            UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
            ExpressionAttributeNames: {
                "#status": "status"
            },
            ExpressionAttributeValues: {
                ":status": "confirmed",
                ":updatedAt": now
            }
        }));

        const updatedOrder: Order = {
            ...order,
            status: 'confirmed',
            updatedAt: now
        };

        return ok({
            message: "Order confirmed successfully",
            data: updatedOrder
        });

    } catch (error: any) {
        console.error("Error in confirmOrder handler:", error);
        return internalServerError(error.message || "Internal server error confirming order");
    }
};

export const handler = withCors(baseHandler);

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../lib/dynamodb';
import { ok, badRequest, notFound, forbidden, internalServerError } from '../lib/response';
import { invokeProductLambda } from '../lib/lambdaInvoke';
import { Order } from '../types/order';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Cancel order event received:", event);
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

        // 2. Verify order is pending
        if (order.status !== 'pending') {
            return badRequest(`Order cannot be cancelled because its current status is '${order.status}'`);
        }

        // 3. Authorization check: caller must be the buyer or a seller of any item in the order
        let isAuthorized = false;

        if (order.userId === callerId) {
            isAuthorized = true;
        } else {
            // Check if caller is a seller of any product in this order
            let sellerProductsResult;
            try {
                sellerProductsResult = await invokeProductLambda("listProductsBySeller", {
                    pathParameters: { sellerId: callerId }
                });
            } catch (err: any) {
                console.error(`Error querying seller products for user ${callerId}:`, err);
            }

            if (sellerProductsResult && sellerProductsResult.statusCode === 200 && sellerProductsResult.body?.products) {
                const sellerProducts = sellerProductsResult.body.products;
                const sellerProductIds = new Set(sellerProducts.map((p: any) => p.productId));
                const isSellerOfAnyItem = order.items.some(item => sellerProductIds.has(item.productId));
                if (isSellerOfAnyItem) {
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized) {
            return forbidden("Access denied. You are not authorized to cancel this order.");
        }

        // 4. Update the order status to cancelled
        const now = new Date().toISOString();
        
        await dynamodb.send(new UpdateCommand({
            TableName: ordersTable,
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

        const updatedOrder: Order = {
            ...order,
            status: 'cancelled',
            updatedAt: now
        };

        return ok({
            message: "Order cancelled successfully",
            data: updatedOrder
        });

    } catch (error: any) {
        console.error("Error in cancelOrder handler:", error);
        return internalServerError(error.message || "Internal server error cancelling order");
    }
};

export const handler = withCors(baseHandler);

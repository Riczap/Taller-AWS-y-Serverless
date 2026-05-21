import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../lib/dynamodb';
import { ok, badRequest, notFound, forbidden, internalServerError } from '../lib/response';
import { invokeProductLambda } from '../lib/lambdaInvoke';
import { Order } from '../types/order';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Get order event received:", event);
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

        const result = await dynamodb.send(new GetCommand({
            TableName: ordersTable,
            Key: { orderId }
        }));

        if (!result.Item) {
            return notFound("Order not found");
        }

        const order = result.Item as Order;

        // 1. If caller is the buyer, allow access
        if (order.userId === callerId) {
            return ok({
                data: order
            });
        }

        // 2. If caller is a seller of any product in this order, allow access
        let sellerProductsResult;
        try {
            sellerProductsResult = await invokeProductLambda("listProductsBySeller", {
                pathParameters: { sellerId: callerId }
            });
        } catch (err: any) {
            console.error(`Error querying seller products for user ${callerId}:`, err);
            return forbidden("Access denied to this order");
        }

        if (sellerProductsResult.statusCode === 200 && sellerProductsResult.body?.products) {
            const sellerProducts = sellerProductsResult.body.products;
            const sellerProductIds = new Set(sellerProducts.map((p: any) => p.productId));
            const isSellerOfAnyItem = order.items.some(item => sellerProductIds.has(item.productId));

            if (isSellerOfAnyItem) {
                return ok({
                    data: order
                });
            }
        }

        return forbidden("Access denied to this order");

    } catch (error: any) {
        console.error("Error in getOrder handler:", error);
        return internalServerError(error.message || "Internal server error retrieving order");
    }
};

export const handler = withCors(baseHandler);

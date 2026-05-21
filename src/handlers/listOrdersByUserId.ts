import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../lib/dynamodb';
import { ok, badRequest, forbidden, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("List orders by user event received:", event);
        const callerId = event.requestContext.authorizer?.userId;
        if (!callerId) {
            return badRequest("User ID is missing from authorization context");
        }

        const targetUserId = event.pathParameters?.userId;
        if (!targetUserId) {
            return badRequest("User ID is required in the path");
        }

        // Security check: Users can only list their own orders
        if (callerId !== targetUserId) {
            return forbidden("Access denied. You can only view your own orders.");
        }

        const ordersTable = process.env.ORDERS_TABLE;
        if (!ordersTable) {
            return internalServerError("ORDERS_TABLE environment variable not configured");
        }

        const result = await dynamodb.send(new QueryCommand({
            TableName: ordersTable,
            IndexName: 'user-orders-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': targetUserId
            },
            ScanIndexForward: false
        }));

        const orders = result.Items || [];

        // Sort by createdAt descending (latest first)
        orders.sort((a: any, b: any) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return ok({
            orders
        });

    } catch (error: any) {
        console.error("Error in listOrdersByUserId handler:", error);
        return internalServerError(error.message || "Internal server error listing orders");
    }
};

export const handler = withCors(baseHandler);

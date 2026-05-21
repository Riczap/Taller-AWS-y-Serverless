import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { dynamodb } from '../lib/dynamodb';
import { created, badRequest, forbidden, internalServerError } from '../lib/response';
import { Product } from '../types/product';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Create product event received:", event);

        const sellerId = event.requestContext.authorizer?.userId;
        const role = event.requestContext.authorizer?.role;

        if (!sellerId || role !== 'seller') {
            return forbidden("Only users with role 'seller' can create products");
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

        const { name, description, price, stock } = body;

        // Validations
        if (!name || !description || price === undefined || stock === undefined) {
            return badRequest("name, description, price, and stock are required fields");
        }

        if (typeof price !== 'number' || price <= 0) {
            return badRequest("price must be a number greater than 0");
        }

        if (typeof stock !== 'number' || !Number.isInteger(stock) || stock <= 0) {
            return badRequest("stock must be an integer greater than 0");
        }

        const productTable = process.env.PRODUCT_TABLE || 'products-local';
        const productId = uuidv4();
        const now = new Date().toISOString();

        const newProduct: Product = {
            productId,
            sellerId,
            name,
            description,
            price,
            stock,
            createdAt: now,
            updatedAt: now
        };

        await dynamodb.send(new PutCommand({
            TableName: productTable,
            Item: newProduct
        }));

        return created({
            message: "Product created successfully",
            data: newProduct
        });

    } catch (error: any) {
        console.error("Error in createProduct handler:", error);
        return internalServerError(error.message || "Internal server error creating product");
    }
};

export const handler = withCors(baseHandler);

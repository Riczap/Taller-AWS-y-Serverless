import { APIGatewayProxyResult } from 'aws-lambda';

export const ok = (data: any): APIGatewayProxyResult => {
    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true
        },
        body: JSON.stringify(data)
    };
};

export const created = (data: any): APIGatewayProxyResult => {
    return {
        statusCode: 201,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true
        },
        body: JSON.stringify(data)
    };
};

export const badRequest = (message: string): APIGatewayProxyResult => {
    return {
        statusCode: 400,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true
        },
        body: JSON.stringify({ message })
    };
};

export const notFound = (message: string = "Not Found"): APIGatewayProxyResult => {
    return {
        statusCode: 404,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true
        },
        body: JSON.stringify({ message })
    };
};

export const forbidden = (message: string = "Forbidden"): APIGatewayProxyResult => {
    return {
        statusCode: 403,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true
        },
        body: JSON.stringify({ message })
    };
};

export const internalServerError = (message: string): APIGatewayProxyResult => {
    return {
        statusCode: 500,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true
        },
        body: JSON.stringify({ message })
    };
};


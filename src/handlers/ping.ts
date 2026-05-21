import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log("Evento desde API Gateway:", event);

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            success: true,
            message: "Hola desde la landa pink"
        })
    };
};

export const handler = withCors(baseHandler);
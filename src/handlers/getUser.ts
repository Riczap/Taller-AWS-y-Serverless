import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../lib/dynamo';
import { ok, badRequest, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Evento de getUser recibido:", event);

        console.log("requestContext.authorizer:", event.requestContext.authorizer);
        const userId = event.requestContext.authorizer?.userId;
        if (!userId) {
            return badRequest("No autorizado o ID de usuario faltante en la autorizacion. Contexto: " + JSON.stringify(event.requestContext.authorizer));
        }

        const userTable = process.env.USERS_TABLE || 'taller-gateway-local-users';

        // Obtener detalles del usuario de la tabla de DynamoDB por clave primaria
        const result = await dynamo.send(new GetCommand({
            TableName: userTable,
            Key: { userId }
        }));

        if (!result.Item) {
            return badRequest("Usuario no encontrado");
        }

        // Excluir la contraseña en la respuesta
        const { password: _, ...userResponse } = result.Item;

        return ok({
            success: true,
            user: userResponse
        });

    } catch (error: any) {
        console.error("Error en el handler de getUser:", error);
        return internalServerError(error.message || "Error interno al obtener el perfil de usuario");
    }
};

export const handler = withCors(baseHandler);

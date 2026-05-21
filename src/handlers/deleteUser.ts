import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../lib/dynamo';
import { ok, badRequest, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Evento de deleteUser recibido:", event);

        const userId = event.requestContext.authorizer?.userId;
        if (!userId) {
            return badRequest("No autorizado o ID de usuario faltante en la autorizacion");
        }

        const userTable = process.env.USERS_TABLE || 'taller-gateway-local-users';

        // Eliminar el usuario de la tabla de DynamoDB por clave primaria
        await dynamo.send(new DeleteCommand({
            TableName: userTable,
            Key: { userId }
        }));

        return ok({
            success: true,
            message: "Usuario eliminado exitosamente"
        });

    } catch (error: any) {
        console.error("Error en el handler de deleteUser:", error);
        return internalServerError(error.message || "Error interno al eliminar el usuario");
    }
};

export const handler = withCors(baseHandler);

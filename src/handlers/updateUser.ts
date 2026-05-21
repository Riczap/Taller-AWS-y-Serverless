import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../lib/dynamo';
import { ok, badRequest, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Evento de updateUser recibido:", event);

        const userId = event.requestContext.authorizer?.userId;
        if (!userId) {
            return badRequest("No autorizado o ID de usuario faltante en la autorizacion");
        }

        if (!event.body) {
            return badRequest("El cuerpo (body) es requerido para actualizar");
        }

        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (e) {
            return badRequest("El cuerpo (body) debe ser un JSON valido");
        }

        const { email, password, name } = body;

        if (!email && !password && !name) {
            return badRequest("Debe proporcionar al menos un campo para actualizar (email, password o name)");
        }

        const userTable = process.env.USERS_TABLE || 'taller-gateway-local-users';

        // 1. Si el email se va a actualizar, verificar si ya está en uso por otro usuario
        if (email) {
            const existingUsers = await dynamo.send(new QueryCommand({
                TableName: userTable,
                IndexName: 'email-index',
                KeyConditionExpression: 'email = :email',
                ExpressionAttributeValues: {
                    ':email': email
                }
            }));

            if (existingUsers.Items && existingUsers.Items.length > 0) {
                const duplicateUser = existingUsers.Items.find(item => item.userId !== userId);
                if (duplicateUser) {
                    return badRequest("El correo electronico ya se encuentra registrado por otro usuario");
                }
            }
        }

        // 2. Construir la expresion de actualizacion dinamicamente
        const updateExpressionParts: string[] = [];
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        if (email !== undefined) {
            updateExpressionParts.push('#email = :email');
            expressionAttributeNames['#email'] = 'email';
            expressionAttributeValues[':email'] = email;
        }

        if (password !== undefined) {
            updateExpressionParts.push('#password = :password');
            expressionAttributeNames['#password'] = 'password';
            expressionAttributeValues[':password'] = password;
        }

        if (name !== undefined) {
            updateExpressionParts.push('#name = :name');
            expressionAttributeNames['#name'] = 'name';
            expressionAttributeValues[':name'] = name;
        }

        const updateExpression = 'SET ' + updateExpressionParts.join(', ');

        const result = await dynamo.send(new UpdateCommand({
            TableName: userTable,
            Key: { userId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        }));

        const updatedUser = result.Attributes;
        if (!updatedUser) {
            return badRequest("No se pudo actualizar el usuario");
        }

        // Excluir la contraseña en la respuesta
        const { password: _, ...userResponse } = updatedUser;

        return ok({
            success: true,
            message: "Usuario actualizado exitosamente",
            user: userResponse
        });

    } catch (error: any) {
        console.error("Error en el handler de updateUser:", error);
        return internalServerError(error.message || "Error interno al actualizar el usuario");
    }
};

export const handler = withCors(baseHandler);

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { dynamo } from '../lib/dynamo';
import { ok, badRequest, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Evento de registro recibido:", event);

        if (!event.body) {
            return badRequest("El cuerpo (body) es requerido");
        }

        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (e) {
            return badRequest("El cuerpo (body) debe ser un JSON valido");
        }

        const { email, password, name, role = 'buyer' } = body;

        if (!email || !password || !name) {
            return badRequest("El email, password y name son requeridos para el registro");
        }

        const userTable = process.env.USERS_TABLE || 'taller-gateway-local-users';

        // 1. Verificar si el email ya existe en la tabla de DynamoDB usando el Global Secondary Index (email-index)
        const existingUsers = await dynamo.send(new QueryCommand({
            TableName: userTable,
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email
            }
        }));

        if (existingUsers.Items && existingUsers.Items.length > 0) {
            return badRequest("El correo electronico ya se encuentra registrado");
        }

        // 2. Crear y guardar el nuevo usuario
        const userId = uuidv4();
        const newUser = {
            userId,
            email,
            password, // Nota: En entornos de produccion, la contrasena debe ser cifrada (ej. bcrypt)
            name,
            role
        };

        await dynamo.send(new PutCommand({
            TableName: userTable,
            Item: newUser
        }));

        // Desestructurar para excluir la contrasena en la respuesta JSON
        const { password: _, ...userResponse } = newUser;

        return ok({
            success: true,
            message: "Usuario creado exitosamente",
            user: userResponse
        });

    } catch (error: any) {
        console.error("Error en el handler de registro:", error);
        return internalServerError(error.message || "Error interno al registrar el usuario");
    }
};

export const handler = withCors(baseHandler);

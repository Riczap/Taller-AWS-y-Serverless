import * as jwt from 'jsonwebtoken';

const jwtSecret = process.env.JWT_SECRET || 'local-secret';

export interface JWTPayload {
    userId: string;
    role: string;
}

export const verifyAccessToken = (token: string): JWTPayload => {
    return jwt.verify(token, jwtSecret) as JWTPayload;
};

export const signAccessToken = (payload: JWTPayload): string => {
    return jwt.sign(payload, jwtSecret, { expiresIn: '15m' });
};

export const signRefreshToken = (payload: JWTPayload): string => {
    return jwt.sign(payload, jwtSecret, { expiresIn: '7d' });
};
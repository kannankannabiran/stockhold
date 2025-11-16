// lib/middleware.js
import { NextResponse } from 'next/server';
import { verifyToken, parseAuthCookie } from './auth';

export function withAuth(handler) {
  return async function(request, ...args) {
    // Get token from Authorization header or cookie
    const authHeader = request.headers.get('authorization');
    const cookieHeader = request.headers.get('cookie');
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (cookieHeader) {
      //const verifyAccess = verifyToken(parseAuthCookie(cookieHeader));
      //console.log('verifyAccess in middleware:', verifyAccess.role, verifyAccess.verified);
      //token = verifyAccess.role == 'admin' && verifyAccess.verified ? parseAuthCookie(cookieHeader) : null;
      token = parseAuthCookie(cookieHeader);
    }
    
    if (!token) {
      return NextResponse.json( 
        { error: 'Access denied. No token provided.' }, 
        { status: 401 }
      );
    }
    
    return handler(request, ...args);
  };
}
import { jwtVerify } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';

const AUTH_COOKIE = 'adelina_token';

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return false;
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'adelina-pms' });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthPage =
    pathname.startsWith('/login') ||
    pathname.startsWith('/esqueci-senha') ||
    pathname.startsWith('/redefinir-senha');
  const isPublicAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon');
  const isLanding = pathname === '/';
  const isPublicForm =
    pathname.startsWith('/cadastro') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/pagamento') ||
    pathname.startsWith('/assinatura-necessaria') ||
    pathname.startsWith('/termos') ||
    pathname.startsWith('/privacidade');

  const authed = await hasValidSession(request);

  if (!authed && !isAuthPage && !isPublicAsset && !isLanding && !isPublicForm) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (authed && isAuthPage && !pathname.startsWith('/redefinir-senha')) {
    const url = request.nextUrl.clone();
    url.pathname = '/painel';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)',
  ],
};

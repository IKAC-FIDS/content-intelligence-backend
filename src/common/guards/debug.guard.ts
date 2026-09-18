import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class DebugGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    console.log('🔍 DebugGuard: Request received');
    console.log('🔍 Headers:', request.headers);
    console.log('🔍 Authorization header:', request.headers.authorization);
    return true; // اجازه عبور به گارد بعدی را می‌دهد
  }
}
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

@Injectable()
export class SsoSecretService {
  private readonly algorithm = "aes-256-gcm";

  constructor(private readonly config: ConfigService) {}

  encryptSecret(value: string): string {
    const key = this.getKey();

    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return [
      "gcm",
      iv.toString("base64"),
      authTag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  }

  decryptSecret(value: string): string {
    const key = this.getKey();

    const parts = value.split(":");
    if (parts.length !== 4 || parts[0] !== "gcm") {
      throw new BadRequestException("Invalid encrypted SSO secret format");
    }

    const [, ivBase64, authTagBase64, encryptedBase64] = parts;

    try {
      const decipher = createDecipheriv(
        this.algorithm,
        key,
        Buffer.from(ivBase64, "base64"),
      );

      decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedBase64, "base64")),
        decipher.final(),
      ]);

      return decrypted.toString("utf8");
    } catch {
      throw new BadRequestException("Invalid encrypted SSO secret");
    }
  }

  //   private getKey(): Buffer {
  //     const secret = this.config.get<string>('SSO_SECRET_ENCRYPTION_KEY');
  //
  //     if (!secret || secret.length < 32) {
  //       throw new InternalServerErrorException(
  //         'SSO secret encryption key is not configured',
  //       );
  //     }
  //
  //     return createHash('sha256').update(secret).digest();
  //   }

  private getKey(): Buffer {
    const secret = this.config.get<string>("SSO_SECRET_ENCRYPTION_KEY");
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        "SSO secret encryption key is not configured",
      );
    }
    return createHash("sha256").update(secret).digest();
  }
}

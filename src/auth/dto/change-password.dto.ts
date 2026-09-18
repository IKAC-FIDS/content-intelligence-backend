import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[a-z]/, {
    message: 'رمز عبور جدید باید حداقل یک حرف کوچک داشته باشد',
  })
  @Matches(/[A-Z]/, {
    message: 'رمز عبور جدید باید حداقل یک حرف بزرگ داشته باشد',
  })
  @Matches(/[0-9]/, {
    message: 'رمز عبور جدید باید حداقل یک عدد داشته باشد',
  })
  @Matches(/[^A-Za-z0-9]/, {
    message: 'رمز عبور جدید باید حداقل یک کاراکتر خاص داشته باشد',
  })
  newPassword!: string;
}
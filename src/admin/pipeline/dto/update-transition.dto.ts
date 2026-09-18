import { PartialType } from '@nestjs/mapped-types';
import { CreateTransitionDto } from './create-transition.dto';

export class UpdateTransitionDto extends PartialType(CreateTransitionDto) {}

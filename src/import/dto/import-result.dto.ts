export class ImportRowErrorDto {
  row!: number;
  message!: string;
}

export class ImportSummaryDto {
  companiesCreated!: number;
  peopleCreated!: number;
}

export class ImportResultDto {
  totalRows!: number;
  successful!: number;
  failed!: number;
  errors!: ImportRowErrorDto[];
  summary!: ImportSummaryDto;
}

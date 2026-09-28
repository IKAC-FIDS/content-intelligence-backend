import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateWorkspaceDto } from '../src/workspaces/dto/create-workspace.dto';
import { UpdateWorkspaceDto } from '../src/workspaces/dto/update-workspace.dto';

describe('Workspace DTO validation', () => {
  it('accepts an IANA timezone and relational Language selections', async () => {
    const dto = plainToInstance(CreateWorkspaceDto, {
      name: 'Workspace',
      code: 'workspace',
      timezone: 'Asia/Tehran',
      inputLanguageIds: ['00000000-0000-4000-8000-000000000001'],
      outputLanguageIds: ['00000000-0000-4000-8000-000000000002'],
      defaultLanguageId: '00000000-0000-4000-8000-000000000002',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects invalid timezone and Language identifiers', async () => {
    const dto = plainToInstance(CreateWorkspaceDto, {
      name: 'Workspace',
      code: 'workspace',
      timezone: 'Mars/Olympus',
      inputLanguageIds: ['not-a-uuid'],
    });
    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['timezone', 'inputLanguageIds']));
  });

  it('allows clearing the default output Language relation', async () => {
    const dto = plainToInstance(UpdateWorkspaceDto, { defaultLanguageId: null });
    expect(await validate(dto)).toHaveLength(0);
  });
});

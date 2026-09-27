import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateWorkspaceDto } from '../src/workspaces/dto/create-workspace.dto';
import { UpdateWorkspaceDto } from '../src/workspaces/dto/update-workspace.dto';

describe('Workspace DTO validation', () => {
  it('accepts an IANA timezone and BCP-47 language code', async () => {
    const dto = plainToInstance(CreateWorkspaceDto, {
      name: 'Workspace',
      code: 'workspace',
      timezone: 'Asia/Tehran',
      defaultLanguageCode: 'fa-IR',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects invalid timezone and language values', async () => {
    const dto = plainToInstance(CreateWorkspaceDto, {
      name: 'Workspace',
      code: 'workspace',
      timezone: 'Mars/Olympus',
      defaultLanguageCode: 'not_a_language',
    });
    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['timezone', 'defaultLanguageCode']));
  });

  it('allows clearing the temporary default language scalar', async () => {
    const dto = plainToInstance(UpdateWorkspaceDto, { defaultLanguageCode: null });
    expect(await validate(dto)).toHaveLength(0);
  });
});

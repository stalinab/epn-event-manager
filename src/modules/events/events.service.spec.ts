import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { CreateEventEntity } from '../../database/entities/create-event.entity';
import { UpdateEventEntity } from '../../database/entities/update-event.entity';
import { DeleteEventEntity } from '../../database/entities/delete-event.entity';
import { QueryEventEntity } from '../../database/entities/query-event.entity';

const createMockRepo = () => ({
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) =>
    Promise.resolve({ id: 1, ...(data as object) }),
  ),
  find: jest.fn(() => Promise.resolve([])),
  findBy: jest.fn(() => Promise.resolve([])),
  count: jest.fn(() => Promise.resolve(0)),
});

describe('EventsService (Mantenimiento Correctivo)', () => {
  let service: EventsService;
  let createRepo: ReturnType<typeof createMockRepo>;
  let updateRepo: ReturnType<typeof createMockRepo>;
  let deleteRepo: ReturnType<typeof createMockRepo>;
  let queryRepo: ReturnType<typeof createMockRepo>;

  beforeEach(async () => {
    createRepo = createMockRepo();
    updateRepo = createMockRepo();
    deleteRepo = createMockRepo();
    queryRepo = createMockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(CreateEventEntity),
          useValue: createRepo,
        },
        {
          provide: getRepositoryToken(UpdateEventEntity),
          useValue: updateRepo,
        },
        {
          provide: getRepositoryToken(DeleteEventEntity),
          useValue: deleteRepo,
        },
        { provide: getRepositoryToken(QueryEventEntity), useValue: queryRepo },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('persists DELETE events with description in delete_events', async () => {
    const dto = {
      source: 'crud-planetas',
      entity: 'planet',
      action: 'DELETE',
      title: 'Planeta eliminado',
      description: 'Se elimino Marte del catalogo',
      payload: { id: 4, name: 'Marte' },
    };

    const result = await service.registerEvent(dto);

    expect(result).toEqual({ ok: true });
    expect(deleteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'crud-planetas',
        entity: 'planet',
        action: 'DELETE',
        title: 'Planeta eliminado',
        description: 'Se elimino Marte del catalogo',
        payload: JSON.stringify(dto.payload),
      }),
    );
    expect(deleteRepo.save).toHaveBeenCalledTimes(1);
  });

  it('continues persisting CREATE, UPDATE, and QUERY events without regressions', async () => {
    const base = {
      source: 'crud-planetas',
      entity: 'planet',
      title: 'Evento de prueba',
      description: 'Descripcion de prueba',
      payload: { id: 1 },
    };

    await service.registerEvent({ ...base, action: 'CREATE' });
    await service.registerEvent({ ...base, action: 'UPDATE' });
    await service.registerEvent({ ...base, action: 'QUERY' });

    expect(createRepo.save).toHaveBeenCalledTimes(1);
    expect(updateRepo.save).toHaveBeenCalledTimes(1);
    expect(queryRepo.save).toHaveBeenCalledTimes(1);
  });

  it('stores timestamps in ISO 8601 UTC format', async () => {
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const base = {
      source: 'crud-futbol',
      entity: 'player',
      title: 'Jugador creado',
      description: 'Se registro un jugador',
      payload: { id: 10 },
    };

    await service.registerEvent({ ...base, action: 'CREATE' });
    await service.registerEvent({ ...base, action: 'UPDATE' });
    await service.registerEvent({ ...base, action: 'DELETE' });
    await service.registerEvent({ ...base, action: 'QUERY' });

    const createdArg = createRepo.create.mock.calls[0][0] as {
      recorded_at: string;
    };
    const updatedArg = updateRepo.create.mock.calls[0][0] as {
      timestamp: string;
    };
    const deletedArg = deleteRepo.create.mock.calls[0][0] as {
      createdAt: string;
    };
    const queriedArg = queryRepo.create.mock.calls[0][0] as {
      event_date: string;
    };

    expect(createdArg.recorded_at).toMatch(isoRegex);
    expect(updatedArg.timestamp).toMatch(isoRegex);
    expect(deletedArg.createdAt).toMatch(isoRegex);
    expect(queriedArg.event_date).toMatch(isoRegex);
  });

  it('normalizes occurredAt across all 4 tables in findAll', async () => {
    createRepo.find.mockResolvedValueOnce([
      { id: 1, recorded_at: '2026-11-27T03:50:00.000Z' },
    ]);
    updateRepo.find.mockResolvedValueOnce([
      { id: 2, timestamp: '2026-11-27T03:52:00.000Z' },
    ]);
    deleteRepo.find.mockResolvedValueOnce([
      { id: 3, createdAt: '2026-11-27T03:51:00.000Z' },
    ]);
    queryRepo.find.mockResolvedValueOnce([
      { id: 4, event_date: '2026-11-27T03:53:00.000Z' },
    ]);

    const events = (await service.findAll()) as Array<{
      id: number;
      occurredAt: string;
      _table: string;
    }>;

    expect(events.map((e) => e.id)).toEqual([1, 3, 2, 4]);
    expect(events.every((e) => typeof e.occurredAt === 'string')).toBe(true);
    expect(events[0].occurredAt).toBe('2026-11-27T03:50:00.000Z');
  });
});

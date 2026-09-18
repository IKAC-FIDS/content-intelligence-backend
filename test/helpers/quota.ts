export function quotaMock() {
  return {
    reserve: jest.fn().mockResolvedValue({
      reservationId: null,
      status: 'BYPASSED',
      quota: { state: 'LEGACY_COMPATIBILITY' },
    }),
    commitReservation: jest
      .fn()
      .mockResolvedValue({ committed: false, bypassed: true }),
    commitReservations: jest.fn().mockResolvedValue([]),
    releaseReservation: jest
      .fn()
      .mockResolvedValue({ released: false, bypassed: true }),
    synchronizeInventory: jest.fn().mockResolvedValue({ currentValue: 0n }),
  };
}

(function() {
  'use strict';

  const KEYS = {
    clients: 'rf_clients',
    contracts: 'rf_contracts',
    fleet: 'rf_fleet',
    invoices: 'rf_invoices',
    agency: 'rf_agency',
    repairs: 'rf_repairs',
  };

  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  console.log('🚀 RentaFlow E2E Test Data Injection starting...');

  // Agency
  write('rf_agency', {
    name: 'Atlas Car Rental',
    city: 'Casablanca',
    address: '23 Bd Anfa, Casablanca',
    phone: '+212 522 000 000',
    email: 'contact@atlascar.ma',
    ice: '001234567000050',
    rc: 'RC-12345',
    if_number: 'IF-98765',
    patente: 'PAT-55432',
    insurance_policy: 'ASSUR-2026-001'
  });

  // 4 Clients
  const clients = [
    {
      id: 'c1', firstName: 'Youssef', lastName: 'Bennani',
      cinNumber: 'AB123456', cinExpiry: '2028-06-15',
      drivingLicenseNumber: 'P12345678', licenseExpiry: '2027-09-20',
      phone: '+212 661 000 111', email: 'youssef.bennani@gmail.com',
      nationality: 'Marocain', createdAt: '2026-01-15T10:00:00.000Z',
      flag: null
    },
    {
      id: 'c2', firstName: 'Fatima', lastName: 'Zahra El Idrissi',
      cinNumber: 'CD789012', cinExpiry: '2029-03-20',
      drivingLicenseNumber: 'Q87654321', licenseExpiry: '2028-05-10',
      phone: '+212 662 000 222', email: 'fz.elidrissi@outlook.com',
      nationality: 'Marocain', createdAt: '2026-02-01T09:00:00.000Z',
      flag: { category: 'Impayé', note: 'Facture RF-2026-0003 non réglée à ce jour' }
    },
    {
      id: 'c3', firstName: 'Ahmed', lastName: 'Tazi',
      cinNumber: 'EF345678', cinExpiry: '2027-11-30',
      drivingLicenseNumber: 'R11223344', licenseExpiry: '2026-12-15',
      phone: '+212 663 000 333', email: 'ahmed.tazi@gmail.com',
      nationality: 'Marocain', createdAt: '2026-02-20T14:00:00.000Z',
      flag: { category: 'Blacklist', note: 'Véhicule rendu avec dommages importants non déclarés' }
    },
    {
      id: 'c4', firstName: 'Sophie', lastName: 'Moreau',
      cinNumber: '', cinExpiry: '',
      drivingLicenseNumber: 'FR-445566', licenseExpiry: '2028-08-01',
      phone: '+33 6 12 34 56 78', email: 'sophie.moreau@gmail.com',
      nationality: 'Française', createdAt: '2026-03-10T11:00:00.000Z',
      flag: null
    },
  ];
  write(KEYS.clients, clients);

  // 5 Vehicles
  const vehicles = [
    {
      id: 'v1', make: 'Dacia', model: 'Logan', year: 2022,
      plate: '12345|أ|21', category: 'Economy', dailyRate: 250,
      status: 'available', mileage: 42000, color: 'Blanc', fuelType: 'Essence',
      purchasePrice: 95000, purchaseDate: '2022-03-15', residualValue: 15000, lifespan: 7,
      maxKmEnabled: true, maxKmPerDay: 200,
      nextOilChangeMileage: 47000, nextTimingBeltMileage: 122000,
      warrantyEnd: '2025-03-15', nextControleTech: '2027-03-15',
      addedAt: '2022-03-15T08:00:00.000Z'
    },
    {
      id: 'v2', make: 'Renault', model: 'Clio', year: 2023,
      plate: '67890|ب|22', category: 'Economy', dailyRate: 280,
      status: 'rented', mileage: 18000, color: 'Rouge', fuelType: 'Essence',
      purchasePrice: 115000, purchaseDate: '2023-06-01', residualValue: 20000, lifespan: 6,
      maxKmEnabled: false,
      nextOilChangeMileage: 28000, nextTimingBeltMileage: 98000,
      warrantyEnd: '2025-06-01', nextControleTech: '2028-06-01',
      addedAt: '2023-06-01T08:00:00.000Z'
    },
    {
      id: 'v3', make: 'Dacia', model: 'Duster', year: 2023,
      plate: '11223|ج|25', category: 'SUV', dailyRate: 450,
      status: 'available', mileage: 8500, color: 'Gris', fuelType: 'Diesel',
      purchasePrice: 185000, purchaseDate: '2023-09-01', residualValue: 40000, lifespan: 8,
      maxKmEnabled: true, maxKmPerDay: 300,
      nextOilChangeMileage: 18500, nextTimingBeltMileage: 88500,
      warrantyEnd: '2026-09-01', nextControleTech: '2028-09-01',
      addedAt: '2023-09-01T08:00:00.000Z'
    },
    {
      id: 'v4', make: 'BMW', model: '320i', year: 2024,
      plate: '44556|د|21', category: 'Luxury', dailyRate: 850,
      status: 'available', mileage: 5200, color: 'Noir', fuelType: 'Essence',
      purchasePrice: 420000, purchaseDate: '2024-01-15', residualValue: 120000, lifespan: 8,
      maxKmEnabled: true, maxKmPerDay: 150,
      nextOilChangeMileage: 15200, nextTimingBeltMileage: 85200,
      warrantyEnd: '2027-01-15', nextControleTech: '2029-01-15',
      addedAt: '2024-01-15T08:00:00.000Z'
    },
    {
      id: 'v5', make: 'Toyota', model: 'Corolla', year: 2021,
      plate: '77889|ه|22', category: 'Sedan', dailyRate: 380,
      status: 'maintenance', mileage: 68000, color: 'Argent', fuelType: 'Hybride',
      purchasePrice: 180000, purchaseDate: '2021-05-01', residualValue: 30000, lifespan: 8,
      maxKmEnabled: false,
      nextOilChangeMileage: 78000, nextTimingBeltMileage: 148000,
      warrantyEnd: '2024-05-01', nextControleTech: '2026-05-01',
      nextRepair: '2026-04-15',
      addedAt: '2021-05-01T08:00:00.000Z'
    },
  ];
  write(KEYS.fleet, vehicles);

  // 6 Contracts
  const contracts = [
    // SCENARIO 1: Closed contract — normal (no extras)
    {
      id: 'cnt1', contractNumber: 'RF-2026-0001',
      clientId: 'c1', clientName: 'Youssef Bennani',
      vehicleId: 'v1', vehicleName: 'Dacia Logan 2022',
      startDate: '2026-02-01', endDate: '2026-02-05',
      startTime: '09:00', endTime: '18:00',
      days: 4, dailyRate: 250, fuelLevel: 'Plein',
      totalHT: 833, tva: 167, totalTTC: 1000,
      mileageOut: 40000,
      status: 'closed',
      returnDate: '2026-02-05', returnMileage: 40720, returnFuelLevel: 'Plein',
      returnDamages: [], extraKmFee: 0, fuelFee: 0, damageFee: 0,
      totalExtraFees: 0, finalTotal: 1000,
      photos: {},
      createdAt: '2026-02-01T09:00:00.000Z'
    },
    // SCENARIO 2: Closed contract — with extra km (km limit exceeded)
    {
      id: 'cnt2', contractNumber: 'RF-2026-0002',
      clientId: 'c2', clientName: 'Fatima Zahra El Idrissi',
      vehicleId: 'v3', vehicleName: 'Dacia Duster 2023',
      startDate: '2026-02-10', endDate: '2026-02-15',
      startTime: '10:00', endTime: '17:00',
      days: 5, dailyRate: 450, fuelLevel: '3/4',
      totalHT: 1875, tva: 375, totalTTC: 2250,
      mileageOut: 7000,
      status: 'closed',
      returnDate: '2026-02-15', returnMileage: 9200, returnFuelLevel: '1/4',
      returnDamages: [{ zone: 'A - Avant', description: 'Petite rayure pare-chocs' }],
      extraKmFee: 400, fuelFee: 200, damageFee: 500,
      totalExtraFees: 1100, finalTotal: 3350,
      photos: {},
      createdAt: '2026-02-10T10:00:00.000Z'
    },
    // SCENARIO 3: Active contract — prolongation scenario
    {
      id: 'cnt3', contractNumber: 'RF-2026-0003',
      clientId: 'c2', clientName: 'Fatima Zahra El Idrissi',
      vehicleId: 'v2', vehicleName: 'Renault Clio 2023',
      startDate: '2026-03-20', endDate: '2026-03-27',
      startTime: '09:00', endTime: '18:00',
      days: 7, dailyRate: 280, fuelLevel: 'Plein',
      totalHT: 1633, tva: 327, totalTTC: 1960,
      mileageOut: 17000,
      status: 'active',
      photos: {},
      createdAt: '2026-03-20T09:00:00.000Z'
    },
    // SCENARIO 4: Active contract — restitution scenario
    {
      id: 'cnt4', contractNumber: 'RF-2026-0004',
      clientId: 'c4', clientName: 'Sophie Moreau',
      vehicleId: 'v1', vehicleName: 'Dacia Logan 2022',
      startDate: '2026-03-22', endDate: '2026-03-27',
      startTime: '08:00', endTime: '20:00',
      days: 5, dailyRate: 250, fuelLevel: 'Plein',
      totalHT: 1042, tva: 208, totalTTC: 1250,
      mileageOut: 41500,
      status: 'active',
      photos: {},
      createdAt: '2026-03-22T08:00:00.000Z'
    },
    // SCENARIO 5: Cancelled contract
    {
      id: 'cnt5', contractNumber: 'RF-2026-0005',
      clientId: 'c3', clientName: 'Ahmed Tazi',
      vehicleId: 'v4', vehicleName: 'BMW 320i 2024',
      startDate: '2026-03-15', endDate: '2026-03-18',
      startTime: '10:00', endTime: '10:00',
      days: 3, dailyRate: 850, fuelLevel: 'Plein',
      totalHT: 2125, tva: 425, totalTTC: 2550,
      mileageOut: 0,
      status: 'cancelled',
      photos: {},
      createdAt: '2026-03-14T15:00:00.000Z'
    },
    // SCENARIO 6: Active contract for v4 (Luxury BMW with km limit)
    {
      id: 'cnt6', contractNumber: 'RF-2026-0006',
      clientId: 'c1', clientName: 'Youssef Bennani',
      vehicleId: 'v4', vehicleName: 'BMW 320i 2024',
      startDate: '2026-03-25', endDate: '2026-03-29',
      startTime: '09:00', endTime: '18:00',
      days: 4, dailyRate: 850, fuelLevel: 'Plein',
      totalHT: 2833, tva: 567, totalTTC: 3400,
      mileageOut: 5200,
      status: 'active',
      photos: {},
      createdAt: '2026-03-25T09:00:00.000Z'
    },
  ];
  write(KEYS.contracts, contracts);

  // 5 Invoices
  const invoices = [
    {
      id: 'inv1', invoiceNumber: 'INV-2026-0001',
      contractId: 'cnt1', contractNumber: 'RF-2026-0001',
      clientId: 'c1', clientName: 'Youssef Bennani',
      vehicleName: 'Dacia Logan 2022',
      startDate: '2026-02-01', endDate: '2026-02-05', days: 4,
      totalHT: 833, tva: 167, totalTTC: 1000, status: 'paid',
      createdAt: '2026-02-05T18:30:00.000Z'
    },
    {
      id: 'inv2', invoiceNumber: 'INV-2026-0002',
      contractId: 'cnt2', contractNumber: 'RF-2026-0002',
      clientId: 'c2', clientName: 'Fatima Zahra El Idrissi',
      vehicleName: 'Dacia Duster 2023',
      startDate: '2026-02-10', endDate: '2026-02-15', days: 5,
      totalHT: 1875, tva: 375, totalTTC: 2250, status: 'paid',
      createdAt: '2026-02-15T17:30:00.000Z'
    },
    {
      id: 'inv3', invoiceNumber: 'INV-2026-0003',
      contractId: 'cnt2', contractNumber: 'RF-2026-0002',
      clientId: 'c2', clientName: 'Fatima Zahra El Idrissi',
      vehicleName: 'Dacia Duster 2023',
      items: [
        { label: 'Km supplémentaires', qty: 200, unitPrice: 2 },
        { label: 'Manque carburant', qty: 2, unitPrice: 100 },
        { label: 'Frais dommages', qty: 1, unitPrice: 500 },
      ],
      totalHT: 917, tva: 183, totalTTC: 1100, status: 'pending',
      notes: 'Frais de restitution',
      createdAt: '2026-02-15T18:00:00.000Z'
    },
    {
      id: 'inv4', invoiceNumber: 'INV-2026-0004',
      contractId: 'cnt3', contractNumber: 'RF-2026-0003',
      clientId: 'c2', clientName: 'Fatima Zahra El Idrissi',
      vehicleName: 'Renault Clio 2023',
      startDate: '2026-03-20', endDate: '2026-03-27', days: 7,
      totalHT: 1633, tva: 327, totalTTC: 1960, status: 'pending',
      createdAt: '2026-03-20T09:30:00.000Z'
    },
    {
      id: 'inv5', invoiceNumber: 'INV-2026-0005',
      contractId: 'cnt6', contractNumber: 'RF-2026-0006',
      clientId: 'c1', clientName: 'Youssef Bennani',
      vehicleName: 'BMW 320i 2024',
      startDate: '2026-03-25', endDate: '2026-03-29', days: 4,
      totalHT: 2833, tva: 567, totalTTC: 3400, status: 'pending',
      createdAt: '2026-03-25T09:30:00.000Z'
    },
  ];
  write(KEYS.invoices, invoices);

  // 3 Repairs
  const repairs = [
    {
      id: 'rep1', vehicleId: 'v5', type: 'Vidange',
      date: '2026-01-10', cost: 350, garage: 'Garage Atlas Casablanca',
      mileage: 65000, notes: 'Vidange + filtre à huile',
      createdAt: '2026-01-10T10:00:00.000Z'
    },
    {
      id: 'rep2', vehicleId: 'v5', type: 'Carrosserie',
      date: '2026-02-20', cost: 2800, garage: 'Carrosserie Central',
      mileage: 67000, notes: 'Réparation aile avant gauche suite accrochage parking',
      createdAt: '2026-02-20T14:00:00.000Z'
    },
    {
      id: 'rep3', vehicleId: 'v1', type: 'Pneus',
      date: '2026-03-01', cost: 1200, garage: 'Pneumatiques Atlas',
      mileage: 41000, notes: 'Remplacement 4 pneus',
      createdAt: '2026-03-01T11:00:00.000Z'
    },
  ];
  write(KEYS.repairs, repairs);

  // Sequence counters
  localStorage.setItem('rf_contract_seq', '6');
  localStorage.setItem('rf_invoice_seq', '5');

  console.log('✅ Test data injected successfully!');
  console.log('📊 Summary:');
  console.log('  - 4 clients (1 flagged Impayé, 1 Blacklist)');
  console.log('  - 5 vehicles (3 available, 1 rented, 1 maintenance)');
  console.log('  - 6 contracts (2 closed, 3 active, 1 cancelled)');
  console.log('  - 5 invoices (2 paid, 3 pending)');
  console.log('  - 3 repairs');
  console.log('');
  console.log('🔄 Reload the page to see the injected data.');

})();

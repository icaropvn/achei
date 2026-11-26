import type { State } from '../types';
export function createInitialState(): State {
 return {
  profileId: null,
  institutions: [
   { id: 'horizonte', name: 'Instituto Horizonte', unit: 'Unidade Central', city: 'Ribeirão Preto / SP', initials: 'IH', description: 'Um ponto de encontro para aprender, conviver e reencontrar.', hours: 'Recepção • Segunda a sexta, das 8h às 18h.' },
   { id: 'movimento', name: 'Centro Movimento', unit: 'Unidade Jardim', city: 'Ribeirão Preto / SP', initials: 'CM', description: 'Achados e perdidos da recepção e dos espaços de atividade.', hours: 'Recepção • Segunda a sábado, das 7h às 20h.' }
  ],
  profiles: [
   { id: 'joana', name: 'Joana Ferreira', role: 'user', initials: 'JF' },
   { id: 'pedro', name: 'Pedro Almeida', role: 'user', initials: 'PA' },
   { id: 'marina', name: 'Marina Costa', role: 'staff', institutionId: 'horizonte', initials: 'MC' },
   { id: 'rafael', name: 'Rafael Lima', role: 'staff', institutionId: 'movimento', initials: 'RL' }
  ],
  items: [
   { id: 'A-014', institutionId: 'horizonte', category: 'Recipientes', summary: 'Garrafa', foundDate: '2026-11-10', location: 'Área comum', description: 'Recipiente reutilizável para bebidas, recebido pela recepção.', evidence: 'Adesivo de estrela sob a base; letras JQ próximas ao adesivo.', storage: 'Armário 2 • Prateleira B', status: 'available' },
   { id: 'A-018', institutionId: 'horizonte', category: 'Mochilas e bolsas', summary: 'Mochila', foundDate: '2026-11-11', location: 'Bloco acadêmico', description: 'Mochila de uso cotidiano entregue à recepção.', evidence: 'Chaveiro de lua no zíper e caderno com as iniciais PA.', storage: 'Armário 1 • Prateleira A', status: 'available' },
   { id: 'A-021', institutionId: 'horizonte', category: 'Chaves', summary: 'Molho de chaves', foundDate: '2026-11-12', location: 'Área externa', description: 'Conjunto de chaves encontrado na unidade.', evidence: 'Três chaves e etiqueta com número 42.', storage: 'Gaveta 3', status: 'available' },
   { id: 'A-009', institutionId: 'horizonte', category: 'Roupas', summary: 'Casaco', foundDate: '2026-11-07', location: 'Biblioteca', description: 'Peça de roupa recebida pelo atendimento.', evidence: 'Nome Joana na etiqueta interna.', storage: 'Entregue', status: 'returned' },
   { id: 'A-011', institutionId: 'horizonte', category: 'Eletrônicos', summary: 'Fones de ouvido', foundDate: '2026-11-08', location: 'Biblioteca', description: 'Acessório eletrônico em processo de devolução.', evidence: 'Estojo com inscrição JF na parte inferior.', storage: 'Armário 2 • Prateleira A', status: 'returning' },
   { id: 'M-003', institutionId: 'movimento', category: 'Recipientes', summary: 'Garrafa', foundDate: '2026-11-10', location: 'Recepção', description: 'Recipiente recebido após uma atividade.', evidence: 'Etiqueta com desenho de bicicleta.', storage: 'Armário da recepção', status: 'available' }
  ],
  losses: [
   { id: 'P-001', userId: 'joana', institutionId: 'horizonte', category: 'Recipientes', startDate: '2026-11-09', endDate: '2026-11-11', location: 'Área comum', description: 'Minha garrafa tem identificação na parte de baixo.', active: true },
   { id: 'P-002', userId: 'joana', institutionId: 'horizonte', category: 'Guarda-chuvas', startDate: '2026-11-10', endDate: '2026-11-12', location: 'Biblioteca', description: 'Guarda-chuva com fita amarela no cabo.', active: true }
  ],
  claims: [
   { id: 'S-008', userId: 'pedro', itemId: 'A-018', description: 'Tem um chaveiro de lua e um caderno com minhas iniciais PA.', response: '', status: 'pending', createdAt: '2026-11-12T10:30:00-03:00', updatedAt: '2026-11-12T10:30:00-03:00' },
   { id: 'S-005', userId: 'joana', itemId: 'A-011', description: 'O estojo dos meus fones tem JF escrito embaixo.', response: 'Propriedade conferida. Aguarde a retirada na recepção.', status: 'approved', createdAt: '2026-11-09T09:00:00-03:00', updatedAt: '2026-11-10T11:00:00-03:00' }
  ],
  notices: [{ id: 'N-001', userId: 'joana', lossId: 'P-001', itemId: 'A-014', read: false, createdAt: '2026-11-12T10:00:00-03:00' }],
  history: [
   { id: 'E-001', itemId: 'A-014', actor: 'Marina Costa', label: 'Objeto cadastrado como disponível.', at: '2026-11-10T09:20:00-03:00' },
   { id: 'E-002', itemId: 'A-018', claimId: 'S-008', actor: 'Pedro Almeida', label: 'Solicitação enviada para análise.', at: '2026-11-12T10:30:00-03:00' },
   { id: 'E-003', itemId: 'A-011', claimId: 'S-005', actor: 'Marina Costa', label: 'Propriedade validada. Aguardando retirada.', at: '2026-11-10T11:00:00-03:00' },
   { id: 'E-004', itemId: 'A-009', actor: 'Marina Costa', label: 'Entrega registrada. Objeto devolvido.', at: '2026-11-08T16:00:00-03:00' }
  ]
 };
}

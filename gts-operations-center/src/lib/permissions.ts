export type Role = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'TECNICO' | 'VENDEDOR' | 'COMERCIAL'

export interface Permission {
  verDashboard:      boolean
  verNOC:            boolean
  verChamados:       boolean
  verEquipes:        boolean
  verMapa:           boolean
  verEstoque:        boolean
  verVendas:         boolean
  verRelatorios:     boolean
  verAuditoria:      boolean
  verUsuarios:       boolean
  verConfiguracoes:  boolean
  verProdutividade:  boolean
  verTV:             boolean
  verFinanceiro:     boolean
  aprovarVendas:     boolean
  aprovarDevolucoes: boolean
  editarUsuarios:    boolean
  excluirRegistros:  boolean
  apenasMinhaEquipe: boolean
}

const PERMISSIONS_MAP: Record<Role, Permission> = {
  ADMIN: {
    verDashboard:      true,
    verNOC:            true,
    verChamados:       true,
    verEquipes:        true,
    verMapa:           true,
    verEstoque:        true,
    verVendas:         true,
    verRelatorios:     true,
    verAuditoria:      true,
    verUsuarios:       true,
    verConfiguracoes:  true,
    verProdutividade:  true,
    verTV:             true,
    verFinanceiro:     true,
    aprovarVendas:     true,
    aprovarDevolucoes: true,
    editarUsuarios:    true,
    excluirRegistros:  true,
    apenasMinhaEquipe: false,
  },
  GESTOR: {
    verDashboard:      true,
    verNOC:            true,
    verChamados:       true,
    verEquipes:        true,
    verMapa:           true,
    verEstoque:        true,
    verVendas:         true,
    verRelatorios:     true,
    verAuditoria:      true,
    verUsuarios:       false,
    verConfiguracoes:  false,
    verProdutividade:  true,
    verTV:             true,
    verFinanceiro:     true,
    aprovarVendas:     true,
    aprovarDevolucoes: true,
    editarUsuarios:    false,
    excluirRegistros:  false,
    apenasMinhaEquipe: false,
  },
  OPERADOR: {
    verDashboard:      true,
    verNOC:            true,
    verChamados:       true,
    verEquipes:        true,
    verMapa:           true,
    verEstoque:        true,
    verVendas:         true,
    verRelatorios:     false,
    verAuditoria:      false,
    verUsuarios:       false,
    verConfiguracoes:  false,
    verProdutividade:  false,
    verTV:             true,
    verFinanceiro:     true,
    aprovarVendas:     false,
    aprovarDevolucoes: false,
    editarUsuarios:    false,
    excluirRegistros:  false,
    apenasMinhaEquipe: false,
  },
  COMERCIAL: {
    verDashboard:      true,
    verNOC:            true,
    verChamados:       true,
    verEquipes:        true,
    verMapa:           true,
    verEstoque:        true,
    verVendas:         true,
    verRelatorios:     false,
    verAuditoria:      false,
    verUsuarios:       false,
    verConfiguracoes:  false,
    verProdutividade:  false,
    verTV:             true,
    verFinanceiro:     true,
    aprovarVendas:     false,
    aprovarDevolucoes: false,
    editarUsuarios:    false,
    excluirRegistros:  false,
    apenasMinhaEquipe: false,
  },
  TECNICO: {
    verDashboard:      false,
    verNOC:            false,
    verChamados:       true,
    verEquipes:        true,
    verMapa:           false,
    verEstoque:        false,
    verVendas:         false,
    verRelatorios:     false,
    verAuditoria:      false,
    verUsuarios:       false,
    verConfiguracoes:  false,
    verProdutividade:  false,
    verTV:             false,
    verFinanceiro:     false,
    aprovarVendas:     false,
    aprovarDevolucoes: false,
    editarUsuarios:    false,
    excluirRegistros:  false,
    apenasMinhaEquipe: true,
  },
  VENDEDOR: {
    verDashboard:      true,
    verNOC:            false,
    verChamados:       false,
    verEquipes:        false,
    verMapa:           false,
    verEstoque:        false,
    verVendas:         true,
    verRelatorios:     false,
    verAuditoria:      false,
    verUsuarios:       false,
    verConfiguracoes:  false,
    verProdutividade:  false,
    verTV:             false,
    verFinanceiro:     false,
    aprovarVendas:     false,
    aprovarDevolucoes: false,
    editarUsuarios:    false,
    excluirRegistros:  false,
    apenasMinhaEquipe: false,
  },
}

export function getPermissions(role: string): Permission {
  return PERMISSIONS_MAP[role as Role] || PERMISSIONS_MAP.OPERADOR
}

export function temPermissao(role: string, permissao: keyof Permission): boolean {
  return getPermissions(role)[permissao] as boolean
}
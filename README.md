# Weeklist CLI 🚀

Gerencie sua semana diretamente do terminal. O **Weeklist CLI** permite que você organize suas tarefas, defina prioridades e gerencie sua produtividade sem sair da linha de comando.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)

## ✨ Funcionalidades

- **Login Simples:** Autenticação via Google OAuth diretamente no navegador.
- **Linguagem Natural:** Adicione tarefas usando termos como "tomorrow", "next monday" ou "25/12".
- **Gestão Completa:** Listagem, criação, conclusão e remoção de tarefas.
- **IA Ready:** Saída de texto otimizada para ser consumida por agentes como Gemini CLI, Claude Code e Cursor.

## 📦 Instalação

### 💡 Instalação Ultra-Rápida (via IA)
Se você usa **Claude Code**, **Gemini CLI** ou **Cursor**, basta colar o comando abaixo no chat:
> "Instale a CLI do Weeklist para mim: https://github.com/jvgelio/weeklist-cli.git"

---

### Instalação Manual
Você também pode instalar globalmente usando o npm:

```bash
# Via repositório remoto
npm install -g https://github.com/jvgelio/weeklist-cli.git

# Ou via clone local
git clone https://github.com/jvgelio/weeklist-cli.git
cd weeklist-cli
npm install -g .
```

## 🛠️ Como usar

### 1. Autenticação
O primeiro passo é conectar sua conta:
```bash
week login
```
*Isso abrirá seu navegador para você autorizar o acesso com sua conta Google.*

### 2. Comandos Principais

| Comando | Descrição |
| :--- | :--- |
| `week list [date]` | Lista tarefas. Aceita filtros avançados de busca e agrupamentos. |
| `week add "Título"` | Adiciona uma nova tarefa com data, prioridade, slot, notas e tags. |
| `week edit <id>` | Modifica propriedades de uma tarefa existente (data, slot, tags, título, notas, etc). |
| `week done <id>` | Marca uma tarefa como concluída (use o ID curto do `list`). |
| `week rm <id>` | Remove uma tarefa permanentemente. |
| `week tag <ls/add/rm>` | Gerencia tags do usuário (listar, adicionar e remover). |
| `week status` | Verifica se você está logado e qual a conta ativa. |

---

### 3. Exemplos Avançados

#### Listagem Avançada (`week list`)
Você pode combinar múltiplos filtros para consultar tarefas:
```bash
# Listar todas as tarefas ativas do usuário
week list --all

# Listar tarefas da semana inteira de uma data
week list monday --week

# Listar apenas tarefas atrasadas (pendentes de dias anteriores)
week list --overdue

# Filtrar tarefas pendentes com prioridade 'high' e tag 'trabalho'
week list --pending --priority high --tag trabalho

# Buscar tarefas contendo o texto "reunião"
week list --search "reunião"
```

#### Edição Completa (`week edit`)
O comando `edit` permite atualizar campos específicos de forma incremental ou substituir propriedades:
```bash
# Alterar o título e mover a tarefa de data/slot
week edit a1b2c3d4 --title "Reunião Remarcada" --date tomorrow --slot pm

# Adicionar uma tag e remover prioridade
week edit a1b2c3d4 --add-tag urgente --clear-priority

# Adicionar/atualizar notas e marcar como feita
week edit a1b2c3d4 --note "Preparar slides antes" --done

# Limpar nota e desmarcar como concluída (voltar a pendente)
week edit a1b2c3d4 --clear-note --undone
```

#### Gerenciador de Tags (`week tag`)
```bash
# Listar tags do usuário e contagem de tarefas associadas
week tag list

# Criar uma tag customizada com cor (formato oklch, hex, rgb)
week tag add "Estudos" "oklch(0.65 0.15 200)"

# Remover tag pelo ID/slug
week tag rm estudos
```

---

## 🤖 Uso com Assistentes de IA (IA-Ready)

Esta CLI foi desenhada para facilitar a integração com agentes de IA (como Gemini CLI, Claude Code e Cursor).

### Opção Global `--json`
Passe a flag `-j` ou `--json` antes ou depois de qualquer comando para obter respostas em JSON estruturado bruto, ideal para parsing direto no código:
```bash
# Obter o payload JSON completo de todas as tarefas da semana
week list monday --week --json

# Adicionar tarefa e obter o UUID completo dela imediatamente no retorno
week add "Tarefa da IA" --json

# Atualizar e obter o estado modificado
week edit a1b2c3d4 --done --json
```

### Tratamento de Erros e Exit Codes
Ao utilizar a flag `--json`, qualquer falha reportará o erro em formato estruturado no canal `stderr`:
```json
{
  "error": "Sessão expirada ou não autenticado. Por favor, faça login com \"week login\".",
  "code": "UNAUTHORIZED"
}
```

A CLI retorna códigos de erro padronizados (`exit codes` do processo):
- **`0`**: Sucesso.
- **`1`**: Argumento inválido ou recurso não encontrado (ex: ID inexistente).
- **`2`**: Sessão expirada ou não autorizado.
- **`3`**: Falha de rede ou indisponibilidade de API.

---

## 📄 Licença

Este projeto está sob a licença ISC.


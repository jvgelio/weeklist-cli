# Weeklist CLI 🚀

Gerencie sua semana diretamente do terminal. O **Weeklist CLI** permite que você organize suas tarefas, defina prioridades e gerencie sua produtividade sem sair da linha de comando.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)

## ✨ Funcionalidades

- **Login Simples:** Autenticação via Google OAuth diretamente no navegador.
- **Linguagem Natural:** Adicione tarefas usando termos como "tomorrow", "next monday" ou "25/12".
- **Gestão Completa:** Listagem, criação, conclusão e remoção de tarefas.
- **IA Ready:** Saída de texto otimizada para ser consumida por agentes como Gemini CLI, Claude Code e Cursor.

## 📦 Instalação

Você pode instalar a CLI globalmente usando o npm:

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
| `week list` | Lista tarefas de hoje. |
| `week list tomorrow` | Lista tarefas de amanhã ou qualquer data/dia da semana. |
| `week add "Título"` | Adiciona uma tarefa para hoje. |
| `week done <id>` | Marca uma tarefa como concluída (use o ID curto do `list`). |
| `week rm <id>` | Remove uma tarefa permanentemente. |
| `week status` | Verifica se você está logado e qual a conta ativa. |

### 3. Exemplos Avançados

**Adicionar tarefa com data, slot e prioridade:**
```bash
week add "Reunião de Projeto" --date monday --slot morning --priority high
```

**Adicionar tarefa recorrente:**
```bash
week add "Academia" --recurring daily
```

## 🤖 Uso com Assistentes de IA

Se você utiliza ferramentas como **Gemini CLI** ou **Claude Code**, a CLI é a ponte perfeita. Você pode pedir:
- *"Gemini, adicione uma tarefa para amanhã à tarde chamada 'Estudar MCP'."*
- *"Claude, liste minhas tarefas de segunda-feira e marque a de 'Limpar casa' como feita."*

## 📄 Licença

Este projeto está sob a licença ISC.

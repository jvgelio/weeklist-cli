#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import Conf from 'conf';
import axios from 'axios';
import { parse } from 'chrono-node';
import { format, addDays, startOfToday } from 'date-fns';
import open from 'open';
import http from 'http';

const config = new Conf({ projectName: 'weeklist-cli' });
const program = new Command();

const DEFAULT_API_URL = 'https://weeklist-production.up.railway.app';
const API_URL = config.get('api_url') || DEFAULT_API_URL;

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Interceptor to add session cookie
api.interceptors.request.use((req) => {
  const sessionId = config.get('session_id');
  if (sessionId) {
    req.headers.Cookie = `session_id=${sessionId}`;
  }
  return req;
});

program
  .name('week')
  .description('Gerencie sua semana com o Weeklist CLI')
  .version('1.0.0');

// --- AUTH COMMANDS ---

program
  .command('login')
  .description('Autenticar na sua conta Google')
  .action(async () => {
    console.log(chalk.blue('Iniciando login...'));
    console.log(chalk.yellow('Abra o navegador e faça login para autorizar a CLI.'));
    
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sessionId = url.searchParams.get('session_id');
      
      if (sessionId) {
        config.set('session_id', sessionId);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Autenticado com sucesso!</h1><p>Pode fechar esta janela e voltar para o terminal.</p>');
        console.log(chalk.green('\nLogin realizado com sucesso!'));
        process.exit(0);
      } else {
        res.writeHead(400);
        res.end('Falha na autenticação.');
      }
    });

    server.listen(4321, () => {
      const authUrl = `${API_URL}/api/auth/google?cli_port=4321`;
      open(authUrl);
    });

    console.log(chalk.gray('Aguardando resposta do navegador (Ctrl+C para cancelar)...'));
  });

program
  .command('logout')
  .description('Sair da conta e remover credenciais')
  .action(() => {
    config.delete('session_id');
    console.log(chalk.green('Logout realizado.'));
  });

program
  .command('status')
  .description('Verificar status da conexão')
  .action(async () => {
    try {
      const res = await api.get('/api/auth/me');
      if (res.data.user) {
        console.log(chalk.green(`Logado como: ${res.data.user.name} (${res.data.user.email})`));
      } else {
        console.log(chalk.red('Não autenticado. Use `week login` para entrar.'));
      }
    } catch (err) {
      console.error(chalk.red('Erro ao verificar status. Verifique sua conexão.'));
    }
  });

// --- TASK COMMANDS ---

function getBucketKey(dateStr) {
  if (!dateStr || dateStr === 'today') return format(new Date(), 'yyyy-MM-dd');
  if (dateStr === 'tomorrow') return format(addDays(new Date(), 1), 'yyyy-MM-dd');
  
  const results = parse(dateStr);
  if (results.length > 0) {
    return format(results[0].start.date(), 'yyyy-MM-dd');
  }
  return dateStr; // Fallback to raw string if it looks like an ISO date
}

program
  .command('list')
  .description('Listar tarefas')
  .argument('[date]', 'Data das tarefas (ex: today, tomorrow, monday)', 'today')
  .action(async (dateArg) => {
    const bucketKey = getBucketKey(dateArg);
    try {
      const res = await api.get('/api/tasks');
      const tasks = res.data.filter(t => t.bucketKey === bucketKey);
      
      if (tasks.length === 0) {
        console.log(chalk.gray(`Nenhuma tarefa encontrada para ${bucketKey}.`));
        return;
      }

      console.log(chalk.bold(`\nTarefas para ${bucketKey}:`));
      tasks.sort((a, b) => a.position - b.position).forEach(t => {
        const icon = t.done ? chalk.green('✔') : chalk.gray('☐');
        const priority = t.priority ? ` [${t.priority}]` : '';
        console.log(`${icon} ${chalk.cyan(t.id.split('-')[0])}: ${t.title}${chalk.yellow(priority)}`);
      });
    } catch (err) {
      console.error(chalk.red('Erro ao buscar tarefas. Você está logado?'));
    }
  });

program
  .command('add')
  .description('Adicionar uma nova tarefa')
  .argument('<title>', 'Título da tarefa')
  .option('-d, --date <date>', 'Data (hoje, amanhã, 2026-05-01)', 'today')
  .option('-s, --slot <slot>', 'Slot (am, pm, eve)', 'am')
  .option('-p, --priority <priority>', 'Prioridade (high, med, low)')
  .option('-r, --recurring <type>', 'Recorrência (daily, weekly, monthly)')
  .action(async (title, options) => {
    const bucketKey = getBucketKey(options.date);
    try {
      const res = await api.post('/api/tasks', {
        title,
        bucketKey,
        slot: options.slot,
        priority: options.priority || null,
        recurring: options.recurring || null,
        position: 0, // Backend logic usually handles this, but we send 0 as default
      });
      console.log(chalk.green(`Tarefa adicionada: ${title} (${bucketKey})`));
    } catch (err) {
      console.error(chalk.red('Erro ao adicionar tarefa.'));
    }
  });

program
  .command('done')
  .description('Marcar tarefa como concluída')
  .argument('<id>', 'ID da tarefa (pode ser o prefixo)')
  .action(async (id) => {
    try {
      // First find the task if a short ID was provided
      const allTasks = await api.get('/api/tasks');
      const task = allTasks.data.find(t => t.id.startsWith(id));
      
      if (!task) {
        console.error(chalk.red('Tarefa não encontrada.'));
        return;
      }

      await api.patch(`/api/tasks/${task.id}`, { done: true });
      console.log(chalk.green(`Tarefa "${task.title}" marcada como concluída!`));
    } catch (err) {
      console.error(chalk.red('Erro ao atualizar tarefa.'));
    }
  });

program
  .command('rm')
  .description('Remover uma tarefa')
  .argument('<id>', 'ID da tarefa')
  .action(async (id) => {
    try {
      const allTasks = await api.get('/api/tasks');
      const task = allTasks.data.find(t => t.id.startsWith(id));
      
      if (!task) {
        console.error(chalk.red('Tarefa não encontrada.'));
        return;
      }

      await api.delete(`/api/tasks/${task.id}`);
      console.log(chalk.green(`Tarefa removida.`));
    } catch (err) {
      console.error(chalk.red('Erro ao remover tarefa.'));
    }
  });

program.parse();

#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import Conf from 'conf';
import axios from 'axios';
import { parse } from 'chrono-node';
import { format, addDays, startOfWeek, endOfWeek, parseISO } from 'date-fns';
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
  .version('1.0.0')
  .option('-j, --json', 'Retornar a saída em formato JSON');

// --- HELPER FUNCTIONS FOR OUTPUT & ERRORS ---

function getJsonMode() {
  return !!program.opts().json;
}

function handleSuccess(data, messageText) {
  if (getJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
  } else if (messageText) {
    console.log(chalk.green(messageText));
  }
  process.exit(0);
}

function handleError(err, defaultMessage, code = 'INTERNAL_ERROR', exitCode = 1) {
  const isJson = getJsonMode();
  let message = defaultMessage;
  let refinedExitCode = exitCode;
  let refinedCode = code;

  if (err && err.response && err.response.data && err.response.data.error) {
    message = err.response.data.error;
  } else if (err && err.message) {
    message = `${defaultMessage} (${err.message})`;
  }

  // Network or Server unavailable
  if (err && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || (err.response && err.response.status >= 500))) {
    refinedExitCode = 3;
    refinedCode = 'NETWORK_ERROR';
    message = 'Não foi possível se conectar ao servidor do Weeklist.';
  } else if (err && err.response && err.response.status === 401) {
    refinedExitCode = 2;
    refinedCode = 'UNAUTHORIZED';
    message = 'Sessão expirada ou não autenticado. Por favor, faça login com "week login".';
  }

  if (isJson) {
    console.error(JSON.stringify({ error: message, code: refinedCode }, null, 2));
  } else {
    console.error(chalk.red(`❌ Erro: ${message}`));
  }
  process.exit(refinedExitCode);
}

function getBucketKey(dateStr) {
  if (!dateStr || dateStr === 'today') return format(new Date(), 'yyyy-MM-dd');
  if (dateStr === 'tomorrow') return format(addDays(new Date(), 1), 'yyyy-MM-dd');
  
  if (dateStr.startsWith('__')) return dateStr; // Inbox/Someday buckets
  
  const results = parse(dateStr);
  if (results.length > 0) {
    return format(results[0].start.date(), 'yyyy-MM-dd');
  }
  return dateStr; // Fallback to raw string if it looks like an ISO date
}

async function resolveTags(tagsInput) {
  if (!tagsInput) return [];
  const tagNames = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
  if (tagNames.length === 0) return [];

  try {
    const tagsRes = await api.get('/api/tags');
    const existingTags = tagsRes.data;

    const resolvedTagIds = [];
    for (const name of tagNames) {
      const slug = name.toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 50);

      const match = existingTags.find(t => t.id === slug || t.name.toLowerCase() === name.toLowerCase());
      if (match) {
        resolvedTagIds.push(match.id);
      } else {
        // Tag doesn't exist, create it automatically
        const hue = Math.floor(Math.random() * 360);
        const color = `oklch(0.7 0.12 ${hue})`;
        const createRes = await api.post('/api/tags', { name, color });
        resolvedTagIds.push(createRes.data.id);
      }
    }
    return resolvedTagIds;
  } catch (err) {
    if (!getJsonMode()) {
      console.warn(chalk.yellow(`Aviso: Não foi possível resolver/criar algumas tags.`));
    }
    return [];
  }
}

// --- AUTH COMMANDS ---

program
  .command('login')
  .description('Autenticar na sua conta Google')
  .action(async () => {
    const isJson = getJsonMode();
    const authUrl = `${API_URL}/api/auth/google?cli_port=4321`;

    if (isJson) {
      console.log(JSON.stringify({
        authUrl,
        message: 'Aguardando resposta de autenticação do navegador no servidor local da porta 4321.'
      }, null, 2));
    } else {
      console.log(chalk.blue('Iniciando login...'));
      console.log(chalk.yellow('Abra o navegador e faça login para autorizar a CLI.'));
    }
    
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sessionId = url.searchParams.get('session_id');
      
      if (sessionId) {
        config.set('session_id', sessionId);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Autenticado com sucesso!</h1><p>Pode fechar esta janela e voltar para o terminal.</p>');
        if (!isJson) console.log(chalk.green('\nLogin realizado com sucesso!'));
        process.exit(0);
      } else {
        res.writeHead(400);
        res.end('Falha na autenticação.');
        process.exit(1);
      }
    });

    server.listen(4321, () => {
      open(authUrl);
    });

    if (!isJson) {
      console.log(chalk.gray('Aguardando resposta do navegador (Ctrl+C para cancelar)...'));
    }
  });

program
  .command('logout')
  .description('Sair da conta e remover credenciais')
  .action(() => {
    config.delete('session_id');
    handleSuccess({ success: true }, 'Logout realizado com sucesso.');
  });

program
  .command('status')
  .description('Verificar status da conexão')
  .action(async () => {
    try {
      const res = await api.get('/api/auth/me');
      if (res.data.user) {
        handleSuccess(
          { authenticated: true, user: res.data.user },
          `Logado como: ${res.data.user.name} (${res.data.user.email})`
        );
      } else {
        handleError(null, 'Não autenticado. Use "week login" para entrar.', 'UNAUTHORIZED', 2);
      }
    } catch (err) {
      handleError(err, 'Erro ao verificar status.', 'STATUS_ERROR', 3);
    }
  });

// --- TASK COMMANDS ---

program
  .command('list')
  .description('Listar tarefas com filtros e visualizações avançadas')
  .argument('[date]', 'Data das tarefas (ex: today, tomorrow, monday)', 'today')
  .option('-a, --all', 'Listar todas as tarefas ativas, ignorando filtros de data')
  .option('-w, --week', 'Listar todas as tarefas da semana em que a data especificada cai')
  .option('-o, --overdue', 'Listar tarefas pendentes atrasadas (de dias anteriores)')
  .option('--pending', 'Filtra para mostrar apenas tarefas não concluídas')
  .option('--done', 'Filtra para mostrar apenas tarefas concluídas')
  .option('-p, --priority <priority>', 'Filtrar por prioridade (high, med, low, null)')
  .option('-t, --tag <tag>', 'Filtrar por tag (nome ou slug)')
  .option('-s, --slot <slot>', 'Filtrar por slot (am, pm, eve, null)')
  .option('--search <query>', 'Filtrar por busca de texto no título')
  .option('--subtasks', 'Incluir subtarefas (apenas no modo JSON)')
  .action(async (dateArg, options) => {
    try {
      const bucketKey = getBucketKey(dateArg);
      let tasks = [];
      let queryParams = {};

      if (options.subtasks) {
        queryParams.includeSubtasks = 'true';
      }

      if (options.all) {
        // Get all tasks
        const res = await api.get('/api/tasks', { params: queryParams });
        tasks = res.data;
      } else if (options.overdue) {
        // Get overdue tasks
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const res = await api.get('/api/tasks', { params: { ...queryParams, overdue_before: todayStr } });
        tasks = res.data;
      } else if (options.week) {
        // Get full week range tasks
        const refDate = parseISO(bucketKey);
        if (isNaN(refDate.getTime())) {
          handleError(null, `A opção --week exige uma data válida (recebeu: "${bucketKey}")`, 'INVALID_DATE', 1);
        }
        const start = format(startOfWeek(refDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const end = format(endOfWeek(refDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const res = await api.get('/api/tasks', { params: { ...queryParams, from: start, to: end } });
        tasks = res.data;
      } else {
        // Case default: single date or specific bucket
        const isDate = /^\d{4}-\d{2}-\d{2}$/.test(bucketKey);
        if (isDate) {
          queryParams.from = bucketKey;
          queryParams.to = bucketKey;
        } else {
          queryParams.bucket = bucketKey;
        }
        const res = await api.get('/api/tasks', { params: queryParams });
        tasks = res.data;
      }

      // --- LOCAL FILTERING ---
      let tagIdFilter = null;
      if (options.tag) {
        try {
          const tagsRes = await api.get('/api/tags');
          const matchedTag = tagsRes.data.find(
            t => t.id === options.tag.toLowerCase() || t.name.toLowerCase() === options.tag.toLowerCase()
          );
          if (matchedTag) {
            tagIdFilter = matchedTag.id;
          } else {
            // Tag not found, filtering will result in empty list
            tagIdFilter = options.tag; 
          }
        } catch (e) {
          // Ignored
        }
      }

      const filteredTasks = tasks.filter(t => {
        // Done / Pending filter
        if (options.pending && t.done) return false;
        if (options.done && !t.done) return false;

        // Priority filter
        if (options.priority !== undefined) {
          const filterPriority = options.priority === 'null' ? null : options.priority;
          if (t.priority !== filterPriority) return false;
        }

        // Slot filter
        if (options.slot !== undefined) {
          const filterSlot = options.slot === 'null' ? null : options.slot;
          if (t.slot !== filterSlot) return false;
        }

        // Search filter
        if (options.search) {
          const query = options.search.toLowerCase();
          const titleMatch = t.title && t.title.toLowerCase().includes(query);
          const noteMatch = t.note && t.note.toLowerCase().includes(query);
          if (!titleMatch && !noteMatch) return false;
        }

        // Tag filter
        if (tagIdFilter) {
          if (!t.tags || !t.tags.includes(tagIdFilter)) return false;
        }

        return true;
      });

      if (getJsonMode()) {
        console.log(JSON.stringify(filteredTasks, null, 2));
        process.exit(0);
      }

      if (filteredTasks.length === 0) {
        console.log(chalk.gray(`Nenhuma tarefa encontrada para os filtros aplicados.`));
        process.exit(0);
      }

      // Load tags map to display names nicely
      let tagMap = {};
      try {
        const tagsRes = await api.get('/api/tags');
        tagsRes.data.forEach(tag => {
          tagMap[tag.id] = tag;
        });
      } catch (err) {
        // Silent fallback
      }

      // Group tasks by bucketKey if we are displaying multiple buckets (like --all, --week, --overdue)
      const isMultiBucket = options.all || options.week || options.overdue;

      if (isMultiBucket) {
        const grouped = {};
        filteredTasks.forEach(t => {
          if (!grouped[t.bucketKey]) grouped[t.bucketKey] = [];
          grouped[t.bucketKey].push(t);
        });

        Object.keys(grouped).sort().forEach(bucket => {
          console.log(chalk.bold(`\n📅 ${bucket}:`));
          grouped[bucket].sort((a, b) => a.position - b.position).forEach(t => {
            const icon = t.done ? chalk.green('✔') : chalk.gray('☐');
            const priority = t.priority ? ` [${t.priority}]` : '';
            const slot = t.slot ? ` (${t.slot})` : '';
            const tagsStr = (t.tags && t.tags.length > 0)
              ? ' ' + t.tags.map(tid => {
                  const tag = tagMap[tid];
                  return chalk.cyan(`#${tag ? tag.name : tid}`);
                }).join(' ')
              : '';
            const noteStr = t.note ? chalk.italic.gray(` - Nota: ${t.note}`) : '';
            console.log(`  ${icon} ${chalk.cyan(t.id.split('-')[0])}:${slot} ${t.title}${chalk.yellow(priority)}${tagsStr}${noteStr}`);
          });
        });
      } else {
        console.log(chalk.bold(`\nTarefas para ${bucketKey}:`));
        filteredTasks.sort((a, b) => a.position - b.position).forEach(t => {
          const icon = t.done ? chalk.green('✔') : chalk.gray('☐');
          const priority = t.priority ? ` [${t.priority}]` : '';
          const slot = t.slot ? ` (${t.slot})` : '';
          const tagsStr = (t.tags && t.tags.length > 0)
            ? ' ' + t.tags.map(tid => {
                const tag = tagMap[tid];
                return chalk.cyan(`#${tag ? tag.name : tid}`);
              }).join(' ')
            : '';
          const noteStr = t.note ? chalk.italic.gray(` - Nota: ${t.note}`) : '';
          console.log(`${icon} ${chalk.cyan(t.id.split('-')[0])}:${slot} ${t.title}${chalk.yellow(priority)}${tagsStr}${noteStr}`);
        });
      }
      process.exit(0);
    } catch (err) {
      handleError(err, 'Erro ao buscar tarefas.', 'TASK_LIST_ERROR', 1);
    }
  });

program
  .command('add')
  .description('Adicionar uma nova tarefa')
  .argument('<title>', 'Título da tarefa')
  .option('-d, --date <date>', 'Data / bucketKey (hoje, amanhã, 2026-05-01, __inbox)', 'today')
  .option('-s, --slot <slot>', 'Slot (am, pm, eve)', 'am')
  .option('-p, --priority <priority>', 'Prioridade (high, med, low)')
  .option('-r, --recurring <type>', 'Recorrência (daily, weekly, monthly)')
  .option('-t, --tags <tags>', 'Tags separadas por vírgula (ex: trabalho,urgente)')
  .option('-n, --note <note>', 'Nota textual descritiva da tarefa')
  .action(async (title, options) => {
    const bucketKey = getBucketKey(options.date);
    try {
      const tagIds = options.tags ? await resolveTags(options.tags) : [];
      const res = await api.post('/api/tasks', {
        title,
        bucketKey,
        slot: options.slot,
        priority: options.priority || null,
        recurring: options.recurring || null,
        tags: tagIds,
        position: 0,
      });
      
      let createdTask = res.data;
      if (options.note) {
        const patchRes = await api.patch(`/api/tasks/${createdTask.id}`, { note: options.note });
        createdTask = patchRes.data;
      }
      
      handleSuccess(createdTask, `Tarefa adicionada: "${title}" (${bucketKey})`);
    } catch (err) {
      handleError(err, 'Erro ao adicionar tarefa.', 'TASK_ADD_ERROR', 1);
    }
  });

program
  .command('edit')
  .description('Editar propriedades de uma tarefa ativa')
  .argument('<id>', 'ID da tarefa (prefixo do ID curto ou UUID completo)')
  .option('--title <title>', 'Novo título da tarefa')
  .option('-d, --date <date>', 'Nova data / bucketKey (hoje, amanhã, __inbox)')
  .option('-s, --slot <slot>', 'Slot (am, pm, eve, null para remover)')
  .option('-p, --priority <priority>', 'Prioridade (high, med, low, null)')
  .option('-r, --recurring <type>', 'Recorrência (daily, weekly, monthly, null)')
  .option('-t, --tags <tags>', 'Substituir todas as tags (separadas por vírgula)')
  .option('--add-tag <tag>', 'Adicionar uma tag específica')
  .option('--remove-tag <tag>', 'Remover uma tag específica')
  .option('-n, --note <note>', 'Nova nota descritiva')
  .option('--done', 'Marcar tarefa como concluída')
  .option('--undone', 'Marcar tarefa como pendente')
  .option('--clear-priority', 'Remover a prioridade da tarefa')
  .option('--clear-recurring', 'Remover a recorrência da tarefa')
  .option('--clear-note', 'Remover a nota descritiva')
  .action(async (id, options) => {
    try {
      // Find task using prefix matching
      const allTasks = await api.get('/api/tasks');
      const task = allTasks.data.find(t => t.id.startsWith(id));
      
      if (!task) {
        handleError(null, `Tarefa com ID contendo "${id}" não encontrada.`, 'TASK_NOT_FOUND', 1);
      }

      let taskUpdated = false;
      let currentTaskState = { ...task };

      // Move bucketKey/slot if date changed (calls /move endpoint)
      if (options.date) {
        const newBucketKey = getBucketKey(options.date);
        if (newBucketKey !== task.bucketKey) {
          const moveRes = await api.patch(`/api/tasks/${task.id}/move`, {
            bucketKey: newBucketKey,
            position: 0,
            slot: options.slot !== undefined ? (options.slot === 'null' ? null : options.slot) : task.slot
          });
          currentTaskState = moveRes.data;
          taskUpdated = true;
        }
      }

      // Update remaining fields
      const patch = {};

      if (options.title !== undefined) patch.title = options.title;
      
      if (options.slot !== undefined && !options.date) {
        patch.slot = options.slot === 'null' ? null : options.slot;
      }

      if (options.done) patch.done = true;
      if (options.undone) patch.done = false;

      if (options.priority !== undefined) {
        patch.priority = options.priority === 'null' ? null : options.priority;
      }
      if (options.clearPriority) patch.priority = null;

      if (options.recurring !== undefined) {
        patch.recurring = options.recurring === 'null' ? null : options.recurring;
      }
      if (options.clearRecurring) patch.recurring = null;

      if (options.note !== undefined) {
        patch.note = options.note === 'null' ? null : options.note;
      }
      if (options.clearNote) patch.note = null;

      // Tags resolution
      if (options.tags !== undefined) {
        patch.tags = await resolveTags(options.tags);
      } else {
        let tagChange = false;
        let newTags = [...(currentTaskState.tags || [])];

        if (options.addTag) {
          const resolvedAdd = await resolveTags(options.addTag);
          for (const tid of resolvedAdd) {
            if (!newTags.includes(tid)) {
              newTags.push(tid);
              tagChange = true;
            }
          }
        }

        if (options.removeTag) {
          const resolvedRemove = await resolveTags(options.removeTag);
          newTags = newTags.filter(tid => !resolvedRemove.includes(tid));
          tagChange = true;
        }

        if (tagChange) {
          patch.tags = newTags;
        }
      }

      // Apply updates if patch is populated
      if (Object.keys(patch).length > 0) {
        const res = await api.patch(`/api/tasks/${task.id}`, patch);
        currentTaskState = res.data;
        taskUpdated = true;
      }

      if (taskUpdated) {
        handleSuccess(currentTaskState, `Tarefa "${currentTaskState.title}" atualizada com sucesso.`);
      } else {
        handleSuccess(currentTaskState, `Nenhuma alteração necessária para a tarefa "${currentTaskState.title}".`);
      }
    } catch (err) {
      handleError(err, 'Erro ao atualizar tarefa.', 'TASK_UPDATE_ERROR', 1);
    }
  });

program
  .command('done')
  .description('Marcar tarefa como concluída')
  .argument('<id>', 'ID da tarefa (prefixo do ID curto ou UUID completo)')
  .action(async (id) => {
    try {
      const allTasks = await api.get('/api/tasks');
      const task = allTasks.data.find(t => t.id.startsWith(id));
      
      if (!task) {
        handleError(null, `Tarefa com ID contendo "${id}" não encontrada.`, 'TASK_NOT_FOUND', 1);
      }

      const res = await api.patch(`/api/tasks/${task.id}`, { done: true });
      handleSuccess(res.data, `Tarefa "${task.title}" marcada como concluída!`);
    } catch (err) {
      handleError(err, 'Erro ao concluir tarefa.', 'TASK_DONE_ERROR', 1);
    }
  });

program
  .command('rm')
  .description('Remover uma tarefa permanentemente')
  .argument('<id>', 'ID da tarefa (prefixo do ID curto ou UUID completo)')
  .action(async (id) => {
    try {
      const allTasks = await api.get('/api/tasks');
      const task = allTasks.data.find(t => t.id.startsWith(id));
      
      if (!task) {
        handleError(null, `Tarefa com ID contendo "${id}" não encontrada.`, 'TASK_NOT_FOUND', 1);
      }

      await api.delete(`/api/tasks/${task.id}`);
      handleSuccess({ success: true, id: task.id }, `Tarefa removida.`);
    } catch (err) {
      handleError(err, 'Erro ao remover tarefa.', 'TASK_DELETE_ERROR', 1);
    }
  });

// --- TAG COMMANDS ---

const tagProgram = program
  .command('tag')
  .description('Gerenciar tags do Weeklist');

tagProgram
  .command('list')
  .alias('ls')
  .description('Listar todas as tags do usuário')
  .action(async () => {
    try {
      const res = await api.get('/api/tags');
      const tagsList = res.data;

      if (getJsonMode()) {
        console.log(JSON.stringify(tagsList, null, 2));
        process.exit(0);
      }

      if (tagsList.length === 0) {
        console.log(chalk.gray('Nenhuma tag encontrada.'));
        process.exit(0);
      }

      console.log(chalk.bold('\nTags disponíveis:'));
      tagsList.forEach(tag => {
        console.log(`* ${chalk.cyan(tag.name)} (ID: ${chalk.gray(tag.id)}) - ${tag.task_count} tarefas`);
      });
      process.exit(0);
    } catch (err) {
      handleError(err, 'Erro ao listar tags.', 'TAG_LIST_ERROR', 1);
    }
  });

tagProgram
  .command('add')
  .description('Criar uma nova tag')
  .argument('<name>', 'Nome da tag')
  .argument('[color]', 'Cor da tag (ex: oklch(0.6 0.1 120), hex ou rgb)')
  .action(async (name, color) => {
    try {
      const tagColor = color || `oklch(0.7 0.12 ${Math.floor(Math.random() * 360)})`;
      const res = await api.post('/api/tags', { name, color: tagColor });
      handleSuccess(res.data, `Tag "${res.data.name}" criada com sucesso!`);
    } catch (err) {
      handleError(err, 'Erro ao criar tag.', 'TAG_CREATE_ERROR', 1);
    }
  });

tagProgram
  .command('rm')
  .description('Excluir uma tag existente')
  .argument('<id>', 'ID (slug) da tag a ser removida')
  .action(async (id) => {
    try {
      await api.delete(`/api/tags/${id}`);
      handleSuccess({ success: true, id }, `Tag "${id}" removida com sucesso.`);
    } catch (err) {
      handleError(err, `Erro ao remover tag. Verifique se a tag "${id}" existe.`, 'TAG_DELETE_ERROR', 1);
    }
  });

program.parse();

// Import Firebase as modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, orderBy, query, where, deleteDoc, doc, writeBatch, updateDoc } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';

// Your Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDKGWRRvI60EymsMUvw41f4MPLZ9dbX5tQ",
    authDomain: "vibetodo-2f6e0.firebaseapp.com",
    projectId: "vibetodo-2f6e0",
    storageBucket: "vibetodo-2f6e0.firebasestorage.app",
    messagingSenderId: "968899802135",
    appId: "1:968899802135:web:93998aad90c0def5f45852"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Set up the terminal
const term = new Terminal({ cursorBlink: true, cols: 80, rows: 24, scrollback: 0 });
term.open(document.getElementById('terminal'));
term.write('Welcome to your Vibe To-Do App! v0.1.0\r\nTop Commands:\r\n  add <task> - Add a task\r\n  show all - List all tasks\r\n  help - See all commands\r\n\r\n> ');

// Handle user input
let input = '';
let awaitingConfirmation = false;
let pendingCommand = null;

const validCommands = [
    'show me my todos', 'show all', 'add', 'show #', 'clear all', 'clear completed',
    'delete', 'complete', 'edit', 'show done', 'show not done', 'help', 'clear', '+', 'list'
];

term.onData(data => {
    if (awaitingConfirmation) {
        if (data.toLowerCase() === 'y') {
            if (pendingCommand === 'clear all') {
                deleteAllTasks();
            } else if (pendingCommand === 'clear completed') {
                clearCompletedTasks();
            }
            awaitingConfirmation = false;
            pendingCommand = null;
            term.write('\r\n\r\n> ');
        } else if (data.toLowerCase() === 'n') {
            term.clear();
            term.write('\r\n\r\nCancelled.\r\n\r\n> ');
            awaitingConfirmation = false;
            pendingCommand = null;
        } else {
            term.clear();
            term.write('\r\n\r\nPlease enter Y or N: ');
        }
    } else {
        if (data === '\r') {  // Enter key
            processCommand(input.trim());
            input = '';
        } else if (data === '\b' || data.charCodeAt(0) === 127) {  // Backspace or Delete
            if (input.length > 0) {
                input = input.slice(0, -1);
                term.write('\b \b');
            }
        } else if (data >= ' ' && data <= '~') {  // Printable characters only
            input += data;
            term.write(data);
        }
    }
});

// Process commands
async function processCommand(command) {
    if (!command) {  // If command is empty, do nothing
        term.clear();
        term.write('\r\n\r\n> ');
        return;
    }

    term.clear();
    const fullCommand = command.toLowerCase();
    const parts = command.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    const taskText = parts.slice(1).join(' ');
    const isValidCommand = validCommands.includes(fullCommand) || validCommands.some(c => fullCommand.startsWith(c + ' ') || c === cmd);
    const commandColor = isValidCommand ? '\x1b[35m' : '\x1b[37m'; // Purple for valid, white for invalid

    // Color the command and task separately
    let coloredCommand = `${commandColor}${cmd}\x1b[37m${taskText ? ' ' + colorHashtags(taskText) : ''}\x1b[0m`;
    term.write('\r\n\r\n' + coloredCommand + '\r\n');

    if (fullCommand === 'show me my todos' || fullCommand === 'show all' || fullCommand === 'list') {
        await listTasks();
    } else if (cmd === 'add' || cmd === '+') {
        const task = command.slice(cmd === 'add' ? 4 : 2).trim();
        if (task) await addTask(task);
    } else if (fullCommand.startsWith('show #')) {
        const hashtag = taskText.slice(1).trim().replace(/^#+/, '');
        if (hashtag) await listTasksByHashtag(hashtag);
    } else if (fullCommand === 'clear all') {
        term.write('\r\nAre you sure you want to delete all tasks? (Y/N): ');
        awaitingConfirmation = true;
        pendingCommand = 'clear all';
    } else if (fullCommand === 'clear completed') {
        term.write('\r\nAre you sure you want to delete all completed tasks? (Y/N): ');
        awaitingConfirmation = true;
        pendingCommand = 'clear completed';
    } else if (cmd === 'delete') {
        const task = taskText.trim();
        if (task) await deleteTask(task);
    } else if (cmd === 'complete') {
        const task = taskText.trim();
        if (task) await completeTask(task);
    } else if (cmd === 'edit') {
        const parts = taskText.split(' to ');
        if (parts.length === 2) {
            const oldTask = parts[0].trim();
            const newTask = parts[1].trim();
            if (oldTask && newTask) await editTask(oldTask, newTask);
        } else {
            term.write('\r\nUsage: edit <old task> to <new text>\r\n\r\n> ');
        }
    } else if (fullCommand === 'show done') {
        await listTasksByStatus(true);
    } else if (fullCommand === 'show not done') {
        await listTasksByStatus(false);
    } else if (cmd === 'help') {
        showHelp();
    } else if (cmd === 'clear' && !taskText) {
        term.clear();
        term.write('\r\n\r\n> ');
    } else {
        term.write('\r\nUnknown command. Type "help" for a list of commands.\r\n\r\n> ');
    }
}

// Add a task to Firestore
async function addTask(task) {
    try {
        await addDoc(collection(db, 'tasks'), { text: task, createdAt: new Date(), completed: false });
        term.write('\r\n\r\nAdded: ' + task + '\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

// List all tasks (top 5 latest without hashtags, then by hashtag with colored titles)
async function listTasks() {
    try {
        const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nNo tasks yet.\r\n\r\n> ');
            return;
        }

        const allTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const totalLines = calculateTotalLines(allTasks);
        term.resize(80, Math.max(24, totalLines));

        term.write('\r\n\r\nLatest 5 Tasks:\r\n');
        const latestTasks = allTasks.slice(0, 5);
        latestTasks.forEach((task, index) => {
            const plainTask = task.text.replace(/#\w+/g, '').trim();
            const status = task.completed ? '[x]' : '[ ]';
            term.write(' ' + (index + 1).toString().padStart(2, ' ') + '. ' + status + ' ' + plainTask + '\r\n');
        });

        term.write('\r\nAll Tasks by Hashtag:\r\n');
        const hashtagMap = {};
        allTasks.forEach(task => {
            const hashtags = (task.text.match(/#\w+/g) || ['#none']);
            hashtags.forEach(hashtag => {
                if (!hashtagMap[hashtag]) hashtagMap[hashtag] = [];
                hashtagMap[hashtag].push(task);
            });
        });

        Object.keys(hashtagMap).sort().forEach(hashtag => {
            const coloredHashtag = colorHashtags(hashtag);
            term.write(' ' + coloredHashtag + ':\r\n');
            hashtagMap[hashtag].forEach((task, index) => {
                const plainTask = task.text.replace(/#\w+/g, '').trim();
                const status = task.completed ? '[x]' : '[ ]';
                term.write('   ' + (index + 1).toString().padStart(2, ' ') + '. ' + status + ' ' + plainTask + '\r\n');
            });
        });
        term.write('\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

// Calculate total lines needed for display
function calculateTotalLines(tasks) {
    let lines = 3; // For "Latest 5 Tasks:" + 2 blank lines
    lines += Math.min(tasks.length, 5); // Latest 5 tasks

    const hashtagMap = {};
    tasks.forEach(task => {
        const hashtags = (task.text.match(/#\w+/g) || ['#none']);
        hashtags.forEach(hashtag => {
            if (!hashtagMap[hashtag]) hashtagMap[hashtag] = [];
            hashtagMap[hashtag].push(task);
        });
    });

    lines += 2; // "All Tasks by Hashtag:" + blank line
    Object.keys(hashtagMap).forEach(hashtag => {
        lines += 1; // Hashtag title
        lines += hashtagMap[hashtag].length; // Tasks under hashtag
    });
    lines += 2; // Final blank lines + prompt
    return lines;
}

// List tasks by hashtag
async function listTasksByHashtag(hashtag) {
    try {
        const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nNo tasks with #' + hashtag + ' yet.\r\n\r\n> ');
            return;
        }

        const tasks = snapshot.docs.map(doc => doc.data()).filter(task => task.text.includes('#' + hashtag));
        const totalLines = tasks.length + 4; // Title + tasks + 3 blank lines + prompt
        term.resize(80, Math.max(24, totalLines));

        term.write('\r\n\r\n');
        const coloredHashtag = colorHashtags('#' + hashtag);
        term.write(coloredHashtag + ':\r\n');
        let index = 1;
        let found = false;
        snapshot.forEach(doc => {
            const task = doc.data();
            if (task.text.includes('#' + hashtag)) {
                const plainTask = task.text.replace(/#\w+/g, '').trim();
                const status = task.completed ? '[x]' : '[ ]';
                term.write('  ' + (index).toString().padStart(2, ' ') + '. ' + status + ' ' + plainTask + '\r\n');
                index++;
                found = true;
            }
        });
        if (!found) term.write('No tasks with #' + hashtag + ' found.\r\n');
        term.write('\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

// Complete a task
async function completeTask(taskText) {
    try {
        const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        let foundTask = null;
        snapshot.forEach(doc => {
            const task = doc.data();
            if (task.text.includes(taskText)) {
                foundTask = doc; // Take the first match
            }
        });
        if (!foundTask) {
            term.write('\r\n\r\nTask containing "' + taskText + '" not found.\r\n\r\n> ');
            return;
        }
        await updateDoc(doc(db, 'tasks', foundTask.id), { completed: true });
        term.write('\r\n\r\nCompleted: ' + foundTask.data().text + '\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

// Edit a task
async function editTask(oldTask, newTask) {
    try {
        const q = query(collection(db, 'tasks'), where('text', '==', oldTask));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nTask "' + oldTask + '" not found.\r\n\r\n> ');
            return;
        }
        const taskDoc = snapshot.docs[0];
        await updateDoc(doc(db, 'tasks', taskDoc.id), { text: newTask, createdAt: new Date() });
        term.write('\r\n\r\nEdited: "' + oldTask + '" to "' + newTask + '"\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

// Clear completed tasks
async function clearCompletedTasks() {
    try {
        const q = query(collection(db, 'tasks'), where('completed', '==', true));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nNo completed tasks to delete.\r\n\r\n> ');
            return;
        }
        const batch = writeBatch(db);
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        term.write('\r\n\r\nAll completed tasks deleted.\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

// List tasks by completion status
async function listTasksByStatus(completed) {
    try {
        const q = query(collection(db, 'tasks'), where('completed', '==', completed), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nNo ' + (completed ? 'completed' : 'incomplete') + ' tasks yet.\r\n\r\n> ');
            return;
        }

        const tasks = snapshot.docs.map(doc => doc.data());
        const totalLines = tasks.length + 4; // 3 blank lines + prompt + tasks
        term.resize(80, Math.max(24, totalLines));

        snapshot.forEach((doc, index) => {
            const task = doc.data();
            const plainTask = task.text.replace(/#\w+/g, '').trim();
            const status = task.completed ? '[x]' : '[ ]';
            term.write(' ' + (index + 1).toString().padStart(2, ' ') + '. ' + status + ' ' + plainTask + '\r\n');
        });
        term.write('\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\nYou may need to create a composite index in Firebase Console for "completed" and "createdAt".\r\n\r\n> ');
    }
}

// Delete all tasks
async function deleteAllTasks() {
    try {
        const q = query(collection(db, 'tasks'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nNo tasks to delete.\r\n\r\n> ');
            return;
        }
        const batch = writeBatch(db);
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        term.write('\r\n\r\nAll tasks deleted.\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

// Delete a specific task
async function deleteTask(taskText) {
    try {
        const q = query(collection(db, 'tasks'), where('text', '==', taskText));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            term.write('\r\n\r\nTask "' + taskText + '" not found.\r\n\r\n> ');
            return;
        }
        const doc = snapshot.docs[0];
        await deleteDoc(doc.ref);
        term.write('\r\n\r\nDeleted: ' + taskText + '\r\n\r\n> ');
    } catch (error) {
        term.write('\r\n\r\nError: ' + error.message + '\r\n\r\n> ');
    }
}

// Show help with all commands
function showHelp() {
    term.write('\r\n\r\nAvailable commands:\r\n');
    term.write('  add <task>          - Add a new task (e.g., "add call mom #home")\r\n');
    term.write('  show all            - List top 5 latest tasks, then all by hashtag\r\n');
    term.write('  show me my todos    - Alias for "show all"\r\n');
    term.write('  list                - Alias for "show all"\r\n');
    term.write('  show #hashtag       - List tasks with a specific hashtag\r\n');
    term.write('  show done           - List completed tasks\r\n');
    term.write('  show not done       - List incomplete tasks\r\n');
    term.write('  complete <task>     - Mark a task as completed (matches partial text)\r\n');
    term.write('  edit <task> to <new text> - Edit a task\'s text\r\n');
    term.write('  delete <task>       - Delete a specific task\r\n');
    term.write('  clear all           - Delete all tasks (requires Y/N confirmation)\r\n');
    term.write('  clear completed     - Delete all completed tasks (requires Y/N confirmation)\r\n');
    term.write('  clear               - Clear the terminal screen\r\n');
    term.write('  help                - Show this help message\r\n');
    term.write('\r\n> ');
}

// Color hashtags consistently
function colorHashtags(task) {
    return task.replace(/#(\w+)/g, (match, hashtag) => {
        const colorCode = hashToColor(hashtag);
        return `\x1b[38;5;${colorCode}m${match}\x1b[0m`;
    });
}

function hashToColor(hashtag) {
    let hash = 0;
    for (let i = 0; i < hashtag.length; i++) {
        hash = hashtag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return (hash % 256);  // ANSI 256-color code
}
export const executeCommand = async (command: string): Promise<string> => {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const cmd = command.trim().toLowerCase();

    switch (cmd) {
        case 'help':
            return '\r\nAvailable commands:\r\n  - help: Show this message\r\n  - whoami: Show current user\r\n  - date: Show current date\r\n  - clear: Clear the screen';
        case 'whoami':
            return '\r\nguest_user';
        case 'date':
            return `\r\n${new Date().toLocaleString()}`;
        case '':
            return '';
        default:
            return `\r\nCommand not found: ${cmd}`;
    }
};
import type { ClientMessage, ServerMessage } from '../../net/protocol';

/** Connexion WebSocket au serveur de salles (même adresse que le jeu, chemin /ws). */
export class RoomConnection {
  private socket: WebSocket | null = null;
  onMessage: (message: ServerMessage) => void = () => {};
  /** Connexion perdue (serveur arrêté, réseau coupé). */
  onClose: () => void = () => {};

  get open(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Se connecte puis se présente avec le jeton du compte (premier message, jamais dans l'adresse) ;
   * le serveur en tire le nom du joueur, et ferme la connexion si le compte n'est pas valide.
   */
  connect(token: string): Promise<void> {
    if (this.open) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      this.socket = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ t: 'hello', token } satisfies ClientMessage));
        resolve();
      };
      socket.onerror = () => reject(new Error('Serveur de duel injoignable.'));
      socket.onmessage = (e) => {
        try {
          this.onMessage(JSON.parse(String(e.data)) as ServerMessage);
        } catch {
          /* message illisible : ignoré */
        }
      };
      socket.onclose = () => {
        if (this.socket === socket) {
          this.socket = null;
          this.onClose();
        }
      };
    });
  }

  send(message: ClientMessage): void {
    if (this.open) this.socket!.send(JSON.stringify(message));
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

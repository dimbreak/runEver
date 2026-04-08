import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { Session, type SessionStatus } from '../agentic/session';
import { ToRendererIpc } from '../contracts/toRenderer';

export class RunEverWindow extends BrowserWindow {
  static sessions: Record<number, Session> = {};
  static nextSessionId = 0;
  static windowById = new Map<number, RunEverWindow>();

  private agenticSessions: Session[] = [];

  constructor(options: BrowserWindowConstructorOptions) {
    super(options);
    RunEverWindow.windowById.set(this.id, this);
    this.newAgenticSession(); // default session
  }
  newAgenticSession(): Session {
    const sessionId = RunEverWindow.nextSessionId;
    const session = new Session(this, sessionId);
    RunEverWindow.nextSessionId += 1;
    RunEverWindow.sessions[sessionId] = session;
    this.agenticSessions.push(session);
    this.pushSessionUpdate();
    return session;
  }
  static getAgenticSession(id?: number) {
    if (id !== undefined) {
      return RunEverWindow.sessions[id];
    }
    return Object.values(RunEverWindow.sessions)[0];
  }

  getAgenticSessions() {
    return this.agenticSessions.slice();
  }

  pushSessionUpdate() {
    const data = this.agenticSessions.reduce(
      (acc, s) => {
        acc[s.id] = s.getStatus();
        return acc;
      },
      {} as Record<number, SessionStatus>,
    );
    console.log('pushSessionUpdate', data);
    ToRendererIpc.sessionsUpdate.send(this.webContents, data);
  }

  endSession(sessionId: number) {
    this.agenticSessions = this.agenticSessions.filter(
      (s) => s.id !== sessionId,
    );
    delete RunEverWindow.sessions[sessionId];
  }
}

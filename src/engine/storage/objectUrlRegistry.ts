/**
 * ObjectUrlRegistry:
 * Registro centralizado de `blob:` ObjectURLs asociados a cada `projectId`.
 * Garantiza que al eliminar un proyecto o limpiar memoria se invoquen todos los
 * `URL.revokeObjectURL()` correspondientes sin fugas de RAM ni referencias colgantes.
 */
class ObjectUrlRegistryImpl {
  private readonly urlsByProject = new Map<string, Set<string>>();
  private readonly projectByUrl = new Map<string, string>();

  /**
   * Crea un nuevo ObjectURL para un Blob y lo asocia al proyecto indicado.
   */
  public create(projectId: string, blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.register(projectId, url);
    return url;
  }

  /**
   * Registra un ObjectURL ya creado para revocarlo cuando el proyecto se elimine.
   */
  public register(projectId: string, url?: string | null): void {
    if (!url || !url.startsWith('blob:')) return;
    const owner = projectId || 'global';
    const prevOwner = this.projectByUrl.get(url);
    if (prevOwner && prevOwner !== owner) {
      this.urlsByProject.get(prevOwner)?.delete(url);
    }
    let set = this.urlsByProject.get(owner);
    if (!set) {
      set = new Set<string>();
      this.urlsByProject.set(owner, set);
    }
    set.add(url);
    this.projectByUrl.set(url, owner);
  }

  /**
   * Revoca un único ObjectURL de manera segura e idempotente.
   */
  public revokeUrl(url?: string | null): boolean {
    if (!url || !url.startsWith('blob:')) return false;
    const owner = this.projectByUrl.get(url);
    if (owner) {
      const set = this.urlsByProject.get(owner);
      set?.delete(url);
      if (set && set.size === 0) {
        this.urlsByProject.delete(owner);
      }
      this.projectByUrl.delete(url);
    }
    try {
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Revoca inmediatamente TODOS los ObjectURLs asociados a un `projectId`.
   */
  public revokeProject(projectId: string): number {
    const set = this.urlsByProject.get(projectId);
    if (!set || set.size === 0) return 0;
    let count = 0;
    for (const url of Array.from(set)) {
      this.projectByUrl.delete(url);
      try {
        URL.revokeObjectURL(url);
        count += 1;
      } catch {
        // Silencioso
      }
    }
    this.urlsByProject.delete(projectId);
    return count;
  }

  public getActiveCount(projectId?: string): number {
    if (projectId) {
      return this.urlsByProject.get(projectId)?.size ?? 0;
    }
    return this.projectByUrl.size;
  }

  public revokeAll(): number {
    let count = 0;
    for (const url of Array.from(this.projectByUrl.keys())) {
      try {
        URL.revokeObjectURL(url);
        count += 1;
      } catch {
        // Silencioso
      }
    }
    this.urlsByProject.clear();
    this.projectByUrl.clear();
    return count;
  }
}

export const objectUrlRegistry = new ObjectUrlRegistryImpl();

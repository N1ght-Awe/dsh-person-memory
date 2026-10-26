// Apply this projection in the host's actual configuration loader.
// A field present in the config file is useless if the loader drops it.
export function personMemoryConfig(file = {}) {
  return {
    enabled: file.personMemory?.enabled === true,
    friendlyReplies: file.personMemory?.friendlyReplies === true,
  };
}


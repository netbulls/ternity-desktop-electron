import { motion, AnimatePresence } from 'motion/react';

export function AnimatedDigit({ char }: { char: string }) {
  return (
    <span
      className="inline-block overflow-hidden"
      style={{ width: char === ':' ? '0.35em' : '0.6em', textAlign: 'center' }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={char}
          initial={{ y: '100%', opacity: 0, filter: 'blur(2px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: '-100%', opacity: 0, filter: 'blur(2px)' }}
          transition={{ type: 'spring', damping: 20, stiffness: 300, mass: 0.5 }}
          className="inline-block"
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

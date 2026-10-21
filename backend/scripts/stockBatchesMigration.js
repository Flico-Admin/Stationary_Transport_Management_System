// Stock batches: every time stock is added, the price of that delivery is saved, so the cost of issued items
// (and the value of the stock in the store) follows the real purchase prices.
// This file is used by "npm run db:migrate-batches" (existing database) and by "npm run db:setup" (new database).
// Safe to run many times: nothing is deleted and nothing is created twice.

export async function migrateStockBatches(conn, dbName) {
  const hasColumn = async (table, column) => {
    const [[row]] = await conn.query(
      'SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?', [dbName, table, column]);
    return row.n > 0;
  };

  // 1. the table that keeps one row for every delivery of stock
  await conn.query(`CREATE TABLE IF NOT EXISTS stock_batches (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    item_id       INT NOT NULL,
    received_date DATE NOT NULL,
    qty_received  INT NOT NULL,
    qty_left      INT NOT NULL,                          -- what is still in the store from this delivery
    unit_price    DECIMAL(12,2) NOT NULL,                -- price of one unit in this delivery
    source        VARCHAR(20) NOT NULL DEFAULT 'purchase',   -- purchase, opening, po, adjustment
    note          VARCHAR(255) NOT NULL DEFAULT '',
    created_by    VARCHAR(100) NOT NULL DEFAULT '',
    created_at    DATETIME NOT NULL,
    CONSTRAINT fk_batch_item FOREIGN KEY (item_id) REFERENCES items(id),
    INDEX idx_batch_fifo (item_id, qty_left, received_date, id)
  ) ENGINE=InnoDB`);
  console.log('Table ready: stock_batches');

  // 2. the exact cost of every issued line (it can come from more than one delivery)
  if (!(await hasColumn('request_lines', 'issued_cost'))) {
    await conn.query('ALTER TABLE request_lines ADD COLUMN issued_cost DECIMAL(14,2) NULL');
    console.log('Added: request_lines.issued_cost');
  } else console.log('Already there: request_lines.issued_cost');

  // 3. stock that is already in the store gets one "opening balance" batch at the item's current price,
  //    so the stock value does not change on the day you switch
  const [res] = await conn.query(
    `INSERT INTO stock_batches (item_id, received_date, qty_received, qty_left, unit_price, source, note, created_by, created_at)
     SELECT i.id, DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)), i.stock, i.stock, i.unit_price, 'opening',
            'Opening balance (stock that was in the store before batch prices were saved)', 'System', UTC_TIMESTAMP()
       FROM items i
      WHERE i.stock > 0 AND NOT EXISTS (SELECT 1 FROM stock_batches b WHERE b.item_id = i.id)`);
  console.log(`Opening balance batches created: ${res.affectedRows}`);
}
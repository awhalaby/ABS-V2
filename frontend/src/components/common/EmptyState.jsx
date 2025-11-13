/**
 * Empty state component for when there's no data to display
 */

export default function EmptyState({
  title = "No data available",
  message = "There is no data to display at this time.",
  icon,
  action,
  className = "",
}) {
  return (
    <div className={`text-center py-12 ${className}`}>
      {icon && (
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

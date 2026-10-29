type IconName =
    | 'sfp'
    | 'odp'
    | 'rasio'
    | 'splitter'
    | 'fiber'
    | 'connector'
    | 'splice'
    | 'hasil';

type Props = {
    name: IconName;
    alt?: string;
    className?: string;
    size?: number;
};

const SRC: Record<IconName, string> = {
    sfp: '/images/icons/sfp.png',
    odp: '/images/icons/odp.png',
    rasio: '/images/icons/rasio.png',
    splitter: '/images/icons/splitter.png',
    fiber: '/images/icons/fiber.png',
    connector: '/images/icons/connector.png',
    splice: '/images/icons/splice.png',
    hasil: '/images/icons/hasil.png',
};

export default function IconPng({
    name,
    alt,
    className = '',
    size = 40,
}: Props) {
    return (
        <img
            src={SRC[name]}
            alt={alt ?? name}
            width={size}
            height={size}
            className={`inline-block object-contain ${className}`}
            draggable={false}
        />
    );
}

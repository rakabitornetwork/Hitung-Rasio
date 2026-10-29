type IconName =
    | 'sfp'
    | 'odp'
    | 'rasio'
    | 'splitter'
    | 'fiber'
    | 'connector'
    | 'splice'
    | 'hasil'
    | 'reset'
    | 'hitung'
    | 'simpan'
    | 'muat'
    | 'update'
    | 'update-ok'
    | 'tampilkan'
    | 'sembunyikan';

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
    reset: '/images/icons/reset.png',
    hitung: '/images/icons/hitung.png',
    simpan: '/images/icons/simpan.png',
    muat: '/images/icons/muat.png',
    update: '/images/icons/update.png',
    'update-ok': '/images/icons/update-ok.png',
    tampilkan: '/images/icons/tampilkan.png',
    sembunyikan: '/images/icons/sembunyikan.png',
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
            className={`inline-block shrink-0 object-contain align-middle ${className}`}
            style={{ width: size, height: size }}
            draggable={false}
        />
    );
}
